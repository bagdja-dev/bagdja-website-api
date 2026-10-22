import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ChatServiceModule } from '../../common/chat-service/chat-service.module';
import {
  TenantStaff,
  Website,
  WebsiteBlogPost,
  WebsiteBlogPostProduct,
  WebsiteCategory,
  WebsiteFaq,
  WebsiteLocation,
  WebsitePage,
  WebsiteProduct,
  WebsiteProductLocation,
  FulfillmentFlow,
  WebsiteEventProductOption,
  WebsiteAndroidApp,
} from '../../entities';
import { ShippingModule } from '../shipping/shipping.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

import { AndroidAssetLinksService } from './android-asset-links.service';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TenantStaff,
      Website,
      WebsitePage,
      WebsiteProduct,
      WebsiteProductLocation,
      WebsiteLocation,
      WebsiteFaq,
      WebsiteBlogPost,
      WebsiteBlogPostProduct,
      WebsiteCategory,
      FulfillmentFlow,
      WebsiteEventProductOption,
      WebsiteAndroidApp,
    ]),
    SubscriptionsModule,
    ShippingModule,
    ChatServiceModule,
  ],
  controllers: [PublicController],
  providers: [PublicService, AndroidAssetLinksService],
})
export class PublicModule {}
