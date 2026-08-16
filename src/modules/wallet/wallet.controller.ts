import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

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
