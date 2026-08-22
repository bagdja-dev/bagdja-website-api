import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard, RolesGuard, Roles, TenantStaffGuard } from '../../common/auth';
import { CompleteFulfillmentStepDto } from './dto/complete-fulfillment-step.dto';
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
  @ApiResponse({ status: 200, description: 'Daftar transaksi milik website ini' })
  async list(
    @Param('websiteId') websiteId: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
    @Query('status') status?: string,
  ) {
    return this.transactionsService.listTenantTransactions(websiteId, {
      page: page ? Number(page) : undefined,
      size: size ? Number(size) : undefined,
      status,
    });
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
}
