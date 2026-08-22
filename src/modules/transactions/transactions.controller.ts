import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';

import { AuthUser, CurrentUser, JwtAuthGuard } from '../../common/auth';
import { CreateTransactionCheckoutDto } from './dto/create-transaction-checkout.dto';
import { TransactionsService } from './transactions.service';

@ApiTags('Transactions')
@Controller('api/transactions')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post('checkout')
  @ApiOperation({
    summary:
      'Checkout cart → buat transaction + transaction_items, escrow + payment, kembalikan checkoutUrl',
  })
  async checkout(
    @CurrentUser() authUser: AuthUser,
    @Body() dto: CreateTransactionCheckoutDto,
  ) {
    return this.transactionsService.createCheckout(authUser, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List transaksi milik buyer yang login' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'size', required: false, type: Number })
  async list(
    @CurrentUser() authUser: AuthUser,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    return this.transactionsService.listTransactions(authUser.userId, {
      page: page ? Number(page) : undefined,
      size: size ? Number(size) : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Detail transaksi (sinkronisasi status dari escrow — pull/polling)',
  })
  async getOne(@CurrentUser() authUser: AuthUser, @Param('id') id: string) {
    return this.transactionsService.getTransaction(id, authUser.userId);
  }

  @Post(':id/retry-checkout')
  @ApiOperation({
    summary:
      'Retry inisialisasi pembayaran transaksi PENDING_PAYMENT — pakai checkout_url yang sudah ada kalau ada, atau inisialisasi ulang kalau belum',
  })
  async retryCheckout(@CurrentUser() authUser: AuthUser, @Param('id') id: string) {
    return this.transactionsService.retryCheckout(id, authUser);
  }

  @Post(':id/cancel')
  @ApiOperation({
    summary: 'Batalkan pesanan sebelum diproses (masih PENDING_PAYMENT) — order dilepas kembali ke keranjang',
  })
  @ApiResponse({ status: 200, description: 'Transaksi berhasil dibatalkan' })
  async cancel(@CurrentUser() authUser: AuthUser, @Param('id') id: string) {
    return this.transactionsService.cancelTransaction(id, authUser);
  }

  @Post(':id/complete')
  @ApiOperation({
    summary:
      'Buyer konfirmasi terima barang — cairkan SISA dana escrow ke penjual. Digate: semua step fulfillment harus sudah selesai (Order Handling Phase 3)',
  })
  @ApiResponse({ status: 200, description: 'Dana berhasil dicairkan ke penjual' })
  async complete(@CurrentUser() authUser: AuthUser, @Param('id') id: string) {
    return this.transactionsService.completeTransaction(id, authUser);
  }

  @Post(':id/dispute')
  @ApiOperation({
    summary: 'Buyer mengajukan komplain — buka dispute (freeze escrow) selama dana masih ditahan',
  })
  @ApiResponse({ status: 200, description: 'Dispute berhasil dibuka, escrow di-freeze' })
  async dispute(@CurrentUser() authUser: AuthUser, @Param('id') id: string) {
    return this.transactionsService.openDisputeForTransaction(id, authUser);
  }

  @Post(':id/orders/:orderId/steps/:stepName/approve-release')
  @ApiOperation({
    summary:
      'Buyer setuju pelepasan dana sebagian untuk 1 step fulfillment (Order Handling Phase 3 §3.0.1)',
  })
  @ApiResponse({ status: 201, description: 'Dana sebagian berhasil dirilis ke penjual' })
  async approveStepRelease(
    @CurrentUser() authUser: AuthUser,
    @Param('id') id: string,
    @Param('orderId') orderId: string,
    @Param('stepName') stepName: string,
  ) {
    await this.transactionsService.approveStepRelease(id, orderId, stepName, authUser.userId);
    return { success: true };
  }

  @Post(':id/orders/:orderId/steps/:stepName/dispute')
  @ApiOperation({
    summary:
      'Buyer mengajukan komplain untuk 1 step fulfillment — TIDAK memanggil payment-service, murni gate lokal (blokir step berikutnya & force-release) sampai buyer approve (§3.0.1)',
  })
  @ApiResponse({ status: 201, description: 'Komplain step berhasil diajukan' })
  async disputeStep(
    @CurrentUser() authUser: AuthUser,
    @Param('id') id: string,
    @Param('orderId') orderId: string,
    @Param('stepName') stepName: string,
  ) {
    await this.transactionsService.disputeStep(id, orderId, stepName, authUser.userId);
    return { success: true };
  }
}
