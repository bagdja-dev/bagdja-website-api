import { Module } from '@nestjs/common';

import { AuthModule } from '../../common/auth/auth.module';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { PlanLimitService } from './plan-limit.service';

@Module({
  imports: [AuthModule],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, PlanLimitService],
  exports: [SubscriptionsService, PlanLimitService],
})
export class SubscriptionsModule {}
