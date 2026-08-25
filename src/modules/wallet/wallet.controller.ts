import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';

import { AuthUser, CurrentUser, JwtAuthGuard } from '../../common/auth';
import { CreateTopupDto } from './dto/create-topup.dto';
import { WalletService } from './wallet.service';

@ApiTags('Wallet')
@Controller('api/wallet')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get('balance')
  @ApiOperation({
    summary:
      'Saldo personal user yang login (auto-created oleh payment-service kalau belum ada)',
  })
  @ApiQuery({ name: 'currency', required: false, description: 'Default IDR' })
  async getBalance(
    @CurrentUser() authUser: AuthUser,
    @Query('currency') currency?: string,
  ) {
    return this.walletService.getBalance(authUser.userId, currency || 'IDR');
  }

  @Get('transactions')
  @ApiOperation({
    summary:
      'Riwayat mutasi saldo (topup, rilis escrow, potongan platform, dll) milik user yang login',
  })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'size', required: false })
  async getTransactions(
    @Req() req: Request,
    @CurrentUser() authUser: AuthUser,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    return this.walletService.getTransactions(
      authUser.userId,
      req.headers.authorization,
      page ? parseInt(page, 10) : 1,
      size ? parseInt(size, 10) : 20,
    );
  }

  @Post('topup')
  @ApiOperation({
    summary:
      'Inisialisasi topup saldo personal user yang login, kembalikan checkoutUrl',
  })
  async topup(
    @CurrentUser() authUser: AuthUser,
    @Body() dto: CreateTopupDto,
  ) {
    const adminAppUrl = this.walletService.adminAppUrl;
    return this.walletService.topup(
      authUser.userId,
      dto.amount,
      dto.currency || 'IDR',
      `${adminAppUrl}/dashboard/billing?status=success`,
      `${adminAppUrl}/dashboard/billing?status=failure`,
    );
  }
}
