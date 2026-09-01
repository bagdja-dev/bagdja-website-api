import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import {
  TenantStaff,
  Website,
  WebsiteBlogPost,
  WebsiteCategory,
  WebsiteFaq,
  WebsiteLocation,
  WebsitePage,
  WebsiteProduct,
  FulfillmentFlow,
} from '../../entities';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { ShippingModule } from '../shipping/shipping.module';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TenantStaff,
      Website,
      WebsitePage,
      WebsiteProduct,
      WebsiteLocation,
      WebsiteFaq,
      WebsiteBlogPost,
      WebsiteCategory,
      FulfillmentFlow,
    ]),
    SubscriptionsModule,
    ShippingModule,
  ],
  controllers: [PublicController],
  providers: [PublicService],
})
export class PublicModule {}
