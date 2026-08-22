import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard, RolesGuard, Roles, TenantStaffGuard } from '../../common/auth';
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
}
