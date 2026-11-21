import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ChatServiceModule } from '../../common/chat-service/chat-service.module';
import {
  TenantStaff,
  Website,
  WebsiteLanguage,
  WebsiteBlogPost,
  WebsiteBlogPostProduct,
  WebsiteCategory,
  WebsiteCategoryTranslation,
  WebsiteFaq,
  WebsiteLocation,
  WebsitePage,
  WebsitePageTranslation,
  WebsiteProduct,
  WebsiteProductTranslation,
  WebsiteProductLocation,
  FulfillmentFlow,
  WebsiteEventProductOption,
  WebsiteAndroidApp,
  WebsiteTemplateVersion,
} from '../../entities';
import { CompanyProfileModule } from '../company-profile/company-profile.module';
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
      WebsitePageTranslation,
      WebsiteLanguage,
      WebsiteProduct,
      WebsiteProductTranslation,
      WebsiteProductLocation,
      WebsiteLocation,
      WebsiteFaq,
      WebsiteBlogPost,
      WebsiteBlogPostProduct,
      WebsiteCategory,
      WebsiteCategoryTranslation,
      FulfillmentFlow,
      WebsiteEventProductOption,
      WebsiteAndroidApp,
      WebsiteTemplateVersion,
    ]),
    SubscriptionsModule,
    ShippingModule,
    ChatServiceModule,
    CompanyProfileModule,
  ],
  controllers: [PublicController],
  providers: [PublicService, AndroidAssetLinksService],
})
export class PublicModule {}
