import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FulfillmentFlow, FulfillmentFlowStep, TenantStaff } from '../../entities';
import { AuthModule } from '../../common/auth';
import { FulfillmentFlowsController } from './fulfillment-flows.controller';
import { FulfillmentFlowsService } from './fulfillment-flows.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([FulfillmentFlow, FulfillmentFlowStep, TenantStaff]),
    AuthModule,
  ],
  controllers: [FulfillmentFlowsController],
  providers: [FulfillmentFlowsService],
  exports: [FulfillmentFlowsService],
})
export class FulfillmentFlowsModule {}
