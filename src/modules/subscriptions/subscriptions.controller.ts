import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';

import { AuthUser, CurrentUser, JwtAuthGuard } from '../../common/auth';
import {
  CancelSubscriptionDto,
  SubscribePlanDto,
} from './dto/subscription.dto';
import { SubscriptionsService } from './subscriptions.service';

@ApiTags('Subscriptions')
@Controller('api/subscriptions')
@ApiBearerAuth()
export class SubscriptionsController {
  constructor(
    private readonly subscriptionsService: SubscriptionsService,
    private readonly configService: ConfigService,
  ) {}

  @Get('plans')
  @ApiOperation({
    summary:
      'Daftar plan aktif Bagdja Website Builder (publik — untuk landing pricing, tanpa login)',
  })
  async listPlans() {
    return this.subscriptionsService.listActivePlans();
  }

  @Get('my')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Subscription milik user yang login untuk app bagdja-website',
  })
  async findMy(@CurrentUser() authUser: AuthUser) {
    return this.subscriptionsService.findMy(authUser.userId);
  }

  @Post('subscribe')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      'Subscribe ke plan (debit wallet personal langsung, tanpa checkout)',
  })
  async subscribe(
    @CurrentUser() authUser: AuthUser,
    @Body() dto: SubscribePlanDto,
  ) {
    return this.subscriptionsService.subscribe(authUser.userId, dto.planId);
  }

  @Post('auto-subscribe-free')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      'Auto-subscribe ke plan free jika user belum punya subscription (idempotent). Disabled jika AUTO_SUBSCRIBE_FREE_ENABLED=false',
  })
  async autoSubscribeFree(@CurrentUser() authUser: AuthUser) {
    const isEnabled = this.configService.get<boolean>(
      'AUTO_SUBSCRIBE_FREE_ENABLED',
      true,
    );

    if (!isEnabled) {
      throw new BadRequestException({
        message: 'Auto-subscribe feature is currently disabled',
        featureEnabled: false,
      });
    }

    return this.subscriptionsService.autoSubscribeFreeIfEligible(
      authUser.userId,
    );
  }

  @Get(':id/billing-history')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Riwayat tagihan subscription milik user yang login',
  })
  async billingHistory(
    @CurrentUser() authUser: AuthUser,
    @Param('id') id: string,
  ) {
    await this.assertOwned(authUser.userId, id);
    return this.subscriptionsService.getBillingHistory(id);
  }

  @Post(':id/cancel')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      'Batalkan subscription milik user yang login (default: di akhir periode)',
  })
  async cancel(
    @CurrentUser() authUser: AuthUser,
    @Param('id') id: string,
    @Body() dto: CancelSubscriptionDto,
  ) {
    await this.assertOwned(authUser.userId, id);
    return this.subscriptionsService.cancel(
      id,
      dto.cancelAtPeriodEnd ?? true,
    );
  }

  @Post(':id/change-plan')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      'Ganti plan (upgrade/downgrade) ke plan lain — proration calculated automatically (sisa periode)',
  })
  async changePlan(
    @CurrentUser() authUser: AuthUser,
    @Param('id') id: string,
    @Body() dto: SubscribePlanDto,
  ) {
    await this.assertOwned(authUser.userId, id);
    return this.subscriptionsService.changePlan(id, dto.planId);
  }

  private async assertOwned(
    userId: string,
    subscriptionId: string,
  ): Promise<void> {
    const mine = (await this.subscriptionsService.findMy(userId)) as Array<{
      id: string;
    }>;
    if (!mine.some((s) => s.id === subscriptionId)) {
      throw new NotFoundException('Subscription not found');
    }
  }
}
