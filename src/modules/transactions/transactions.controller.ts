import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

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
}
