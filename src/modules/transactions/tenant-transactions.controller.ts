import { BadRequestException, Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard, RolesGuard, Roles, TenantStaffGuard } from '../../common/auth';

import { AddAdhocTerminDto } from './dto/add-adhoc-termin.dto';
import { CompleteFulfillmentStepDto } from './dto/complete-fulfillment-step.dto';
import { ListTerminsQueryDto } from './dto/list-termins-query.dto';
import {
  TenantTransactionListResponseDto,
  TenantTransactionSummaryDto,
} from './dto/tenant-transaction-list-response.dto';
import { TerminCountResponseDto, TerminListResponseDto } from './dto/termin-list-item.dto';
import { TransactionsService } from './transactions.service';

/**
 * Order Handling Phase 1 (plan/website-builder/order-hanlde-plan.md) —
 * visibilitas pesanan untuk tenant/seller (bagdja-website-admin). Terpisah
 * dari `TransactionsController` (buyer-facing, scope `buyer_user_id`) karena
 * guard-nya beda total: di sini scope `website_id` + role tenant staff,
 * bukan kepemilikan buyer.
 */
@ApiTags('Tenant Transactions')
@Controller('api/websites/:websiteId/transactions')
@UseGuards(JwtAuthGuard, TenantStaffGuard, RolesGuard)
@ApiBearerAuth()
export class TenantTransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get()
  @Roles('viewer')
  @ApiOperation({ summary: 'List pesanan masuk ke website ini (filter opsional by status)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'size', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'vendorId', required: false, type: String, description: 'Filter by vendor yang ditugaskan (D5, rekonsiliasi manual)' })
  @ApiQuery({ name: 'q', required: false, type: String, description: 'Cari pembeli, nomor transaksi, atau produk' })
  @ApiQuery({ name: 'from', required: false, type: String, description: 'Tanggal awal, YYYY-MM-DD' })
  @ApiQuery({ name: 'to', required: false, type: String, description: 'Tanggal akhir, YYYY-MM-DD (inklusif)' })
  @ApiQuery({ name: 'needs_action', required: false, type: Boolean })
  @ApiQuery({ name: 'released_this_month', required: false, type: Boolean })
  @ApiQuery({ name: 'kind', required: false, enum: ['order', 'gathering'] })
  @ApiResponse({ status: 200, description: 'Daftar transaksi dan gathering milik website ini', type: TenantTransactionListResponseDto })
  async list(
    @Param('websiteId') websiteId: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
    @Query('status') status?: string,
    @Query('vendorId') vendorId?: string,
    @Query('q') search?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('needs_action') needsAction?: string,
    @Query('released_this_month') releasedThisMonth?: string,
    @Query('kind') kind?: string,
  ) {
    if (kind && kind !== 'order' && kind !== 'gathering') {
      throw new BadRequestException('kind must be order or gathering');
    }
    const transactionKind = kind as 'order' | 'gathering' | undefined;
    return this.transactionsService.listTenantTransactions(websiteId, {
      page: page ? Number(page) : undefined,
      size: size ? Number(size) : undefined,
      status,
      vendorId,
      search,
      from,
      to,
      needsAction: needsAction === 'true',
      releasedThisMonth: releasedThisMonth === 'true',
      kind: transactionKind,
    });
  }

  @Get('summary')
  @Roles('viewer')
  @ApiOperation({ summary: 'Ringkasan pesanan untuk kartu filter menu Pesanan Studio' })
  @ApiResponse({ status: 200, description: 'Hitungan pesanan/gathering, dana tertahan, dan pencairan bulan ini', type: TenantTransactionSummaryDto })
  async summary(@Param('websiteId') websiteId: string) {
    return this.transactionsService.getTenantTransactionSummary(websiteId);
  }

  // NOTE: rute `termins`/`termins/count` di bawah ini WAJIB didaftarkan
  // SEBELUM `@Get(':id')` — kalau tidak, request ke `.../transactions/termins`
  // akan ketangkap sebagai `getOne(id: 'termins')` karena `:id` cocok dengan
  // segmen literal apa pun.
  @Get('termins')
  @Roles('viewer')
  @ApiOperation({ summary: 'List Termin lintas-order milik website ini (halaman "Invoice" seller)' })
  @ApiResponse({ status: 200, description: 'Daftar Termin', type: TerminListResponseDto })
  async listTermins(@Param('websiteId') websiteId: string, @Query() query: ListTerminsQueryDto) {
    return this.transactionsService.listWebsiteTermins(websiteId, query);
  }

  @Get('termins/count')
  @Roles('viewer')
  @ApiOperation({
    summary: 'Jumlah Termin sesuai filter status (badge sidebar) — default status=SCHEDULED kalau tidak diisi',
  })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Jumlah Termin', type: TerminCountResponseDto })
  async countTermins(@Param('websiteId') websiteId: string, @Query('status') status?: string) {
    return { count: await this.transactionsService.countWebsiteTermins(websiteId, status ?? 'SCHEDULED') };
  }

  @Get(':id')
  @Roles('viewer')
  @ApiOperation({
    summary: 'Detail 1 pesanan milik website ini (sinkronisasi status dari escrow + ringkasan dana)',
  })
  @ApiResponse({ status: 200, description: 'Detail transaksi + ringkasan escrow' })
  async getOne(@Param('websiteId') websiteId: string, @Param('id') id: string) {
    return this.transactionsService.getTenantTransaction(websiteId, id);
  }

  @Post(':id/refund')
  @Roles('admin')
  @ApiOperation({
    summary:
      'Seller refund pembeli — resolusi dispute atau refund sukarela. Hanya kalau status HELD/DISPUTED.',
  })
  @ApiResponse({ status: 200, description: 'Dana berhasil direfund ke pembeli' })
  async refund(@Param('websiteId') websiteId: string, @Param('id') id: string) {
    return this.transactionsService.refundTenantTransaction(websiteId, id);
  }

  @Post(':id/orders/:orderId/steps/complete')
  @Roles('editor')
  @ApiOperation({
    summary:
      'Seller menandai 1 step fulfillment selesai (Order Handling Phase 3 §3.0.1) — validasi urutan + form_data sesuai form_schema step',
  })
  @ApiResponse({ status: 201, description: 'Step berhasil ditandai selesai' })
  async completeFulfillmentStep(
    @Param('websiteId') websiteId: string,
    @Param('id') id: string,
    @Param('orderId') orderId: string,
    @Body() dto: CompleteFulfillmentStepDto,
  ) {
    await this.transactionsService.completeFulfillmentStep(websiteId, id, orderId, dto);
    return { success: true };
  }

  @Post(':id/orders/:orderId/steps/draft')
  @Roles('editor')
  @ApiOperation({ summary: 'Seller menyimpan draft form step Pascaorder' })
  async saveFulfillmentStepDraft(
    @Param('websiteId') websiteId: string,
    @Param('id') id: string,
    @Param('orderId') orderId: string,
    @Body() dto: CompleteFulfillmentStepDto,
  ) {
    await this.transactionsService.saveFulfillmentStepDraftAsAdmin(websiteId, id, orderId, dto);
    return { success: true };
  }

  @Post(':id/force-complete')
  @Roles('editor')
  @ApiOperation({
    summary:
      'Seller force-complete transaksi (rilis sisa dana) kalau buyer tidak konfirm terima barang setelah masa garansi lewat — butuh semua produk di transaksi ini sudah diatur final_release_guaranty_days (Order Handling Phase 3 §3.0.2)',
  })
  @ApiResponse({ status: 201, description: 'Sisa dana berhasil dirilis, transaksi ditandai DELIVERED' })
  async forceComplete(@Param('websiteId') websiteId: string, @Param('id') id: string) {
    return this.transactionsService.forceCompleteTransaction(websiteId, id);
  }

  @Post(':id/orders/:orderId/steps/:stepName/force-release')
  @Roles('editor')
  @ApiOperation({
    summary:
      'Seller force-release dana step setelah masa garansi lewat tanpa approval buyer — diblokir kalau step sedang dikomplain (§3.0.1)',
  })
  @ApiResponse({ status: 201, description: 'Dana berhasil dirilis' })
  async forceReleaseStep(
    @Param('websiteId') websiteId: string,
    @Param('id') id: string,
    @Param('orderId') orderId: string,
    @Param('stepName') stepName: string,
  ) {
    await this.transactionsService.forceReleaseStep(websiteId, id, orderId, stepName);
    return { success: true };
  }

  @Post(':id/orders/:orderId/termins/:terminId/issue')
  @Roles('editor')
  @ApiOperation({
    summary:
      'Seller "Terbitkan" 1 Termin yang sudah dijadwalkan (fulfillment-praorder-plan.md §2.4) — dibuka supaya buyer bisa bayar',
  })
  @ApiResponse({ status: 201, description: 'Termin berhasil diterbitkan (status ISSUED)' })
  async issueTermin(
    @Param('websiteId') websiteId: string,
    @Param('id') id: string,
    @Param('orderId') orderId: string,
    @Param('terminId') terminId: string,
  ) {
    return this.transactionsService.issueTermin(websiteId, id, orderId, terminId);
  }

  @Post(':id/orders/:orderId/termins/adhoc')
  @Roles('editor')
  @ApiOperation({
    summary: 'Seller buat Tagihan Tambahan ad-hoc (§2.4.1, Q12) — langsung ISSUED, tidak ikut validasi SUM=100%',
  })
  @ApiResponse({ status: 201, description: 'Tagihan Tambahan berhasil dibuat' })
  async addAdhocTermin(
    @Param('websiteId') websiteId: string,
    @Param('id') id: string,
    @Param('orderId') orderId: string,
    @Body() dto: AddAdhocTerminDto,
  ) {
    return this.transactionsService.addAdhocTermin(websiteId, id, orderId, dto);
  }
}
