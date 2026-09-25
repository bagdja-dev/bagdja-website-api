import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard, Roles, RolesGuard, TenantStaffGuard } from '../../common/auth';
import { CompleteFulfillmentStepDto } from '../transactions/dto/complete-fulfillment-step.dto';
import { TransactionsService } from '../transactions/transactions.service';
import { AssignVendorDto } from './dto/assign-vendor.dto';
import { CancelDraftOrderDto } from './dto/cancel-draft-order.dto';
import { DraftOrderCountResponseDto } from './dto/draft-order-count-response.dto';
import { SetOrderQuoteDto } from './dto/set-order-quote.dto';
import { OrdersService } from './orders.service';

@ApiTags('Tenant Orders')
@Controller('api/websites/:websiteId/orders')
@UseGuards(JwtAuthGuard, TenantStaffGuard, RolesGuard)
@ApiBearerAuth()
export class TenantOrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly transactionsService: TransactionsService,
  ) {}

  @Get('drafts')
  @Roles('viewer')
  @ApiOperation({
    summary:
      'List draft order/cart yang belum checkout untuk inbox praorder tenant — tiap item menyertakan praorderProgress kalau produknya punya step Praorder',
  })
  async drafts(@Param('websiteId') websiteId: string) {
    const drafts = await this.ordersService.listTenantDraftOrders(websiteId);
    return Promise.all(
      drafts.map(async (draft) => ({
        ...draft,
        praorderProgress: await this.transactionsService.getOrderPraorderProgress(draft),
      })),
    );
  }

  @Get('drafts/count')
  @Roles('viewer')
  @ApiOperation({ summary: 'Jumlah draft order yang menunggu quotation (badge sidebar "Penawaran")' })
  @ApiResponse({ status: 200, description: 'Jumlah draft menunggu quotation', type: DraftOrderCountResponseDto })
  async countDraftsAwaitingQuotation(@Param('websiteId') websiteId: string) {
    return { count: await this.ordersService.countDraftOrdersAwaitingQuotation(websiteId) };
  }

  @Get('preorders/cancelled')
  @Roles('viewer')
  @ApiOperation({ summary: 'List praorder quotable yang dibatalkan setelah memiliki quotation' })
  async cancelledPreorders(@Param('websiteId') websiteId: string) {
    return this.ordersService.listTenantCancelledPreorders(websiteId);
  }

  @Post(':orderId/steps/complete')
  @Roles('editor')
  @ApiOperation({
    summary:
      'Admin/tenant menyelesaikan 1 step Praorder (fulfillment-praorder-plan.md §2.1) — order masih PENDING, belum checkout',
  })
  async completePraorderStep(
    @Param('websiteId') websiteId: string,
    @Param('orderId') orderId: string,
    @Body() dto: CompleteFulfillmentStepDto,
  ) {
    await this.transactionsService.completePraorderStepAsAdmin(websiteId, orderId, dto);
    return { success: true };
  }

  @Post(':orderId/steps/draft')
  @Roles('editor')
  @ApiOperation({ summary: 'Admin menyimpan draft form step Praorder' })
  async savePraorderStepDraft(
    @Param('websiteId') websiteId: string,
    @Param('orderId') orderId: string,
    @Body() dto: CompleteFulfillmentStepDto,
  ) {
    await this.transactionsService.savePraorderStepDraftAsAdmin(websiteId, orderId, dto);
    return { success: true };
  }

  @Get('vendor-candidates')
  @Roles('viewer')
  @ApiOperation({ summary: 'List vendor aktif yang melayani lokasi order' })
  @ApiQuery({ name: 'locationId', required: true, type: String })
  async vendorCandidates(
    @Param('websiteId') websiteId: string,
    @Query('locationId') locationId: string,
  ) {
    return this.ordersService.listVendorCandidates(websiteId, locationId);
  }

  @Get(':orderId')
  @Roles('viewer')
  @ApiOperation({ summary: 'Detail 1 order milik website (draft, cancelled, atau sudah di-claim transaksi)' })
  async getOne(@Param('websiteId') websiteId: string, @Param('orderId') orderId: string) {
    const order = await this.ordersService.getTenantOrder(websiteId, orderId);
    const praorderProgress = await this.transactionsService.getOrderPraorderProgress(order);
    return { ...order, praorderProgress };
  }

  @Patch(':orderId/assign-vendor')
  @Roles('editor')
  @ApiOperation({ summary: 'Tugaskan vendor secara manual ke order' })
  async assignVendor(
    @Param('websiteId') websiteId: string,
    @Param('orderId') orderId: string,
    @Body() dto: AssignVendorDto,
  ) {
    return this.ordersService.assignVendor(websiteId, orderId, dto.vendor_id);
  }

  @Patch(':orderId/quote')
  @Roles('editor')
  @ApiOperation({ summary: 'Tetapkan harga final quotation pada draft praorder' })
  async setQuote(
    @Param('websiteId') websiteId: string,
    @Param('orderId') orderId: string,
    @Body() dto: SetOrderQuoteDto,
  ) {
    return this.ordersService.setDraftQuote(websiteId, orderId, dto.final_price, dto.termins);
  }

  @Post(':orderId/cancel')
  @Roles('editor')
  @ApiOperation({ summary: 'Seller batalkan draft praorder (belum checkout) — mis. quotation ditolak/tidak direspons buyer' })
  @ApiResponse({ status: 201, description: 'Draft berhasil dibatalkan' })
  async cancelDraft(
    @Param('websiteId') websiteId: string,
    @Param('orderId') orderId: string,
    @Body() dto: CancelDraftOrderDto,
  ) {
    return this.ordersService.cancelDraftAsAdmin(websiteId, orderId, dto.reason);
  }
}