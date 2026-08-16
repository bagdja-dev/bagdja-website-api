import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import {
  TenantStaff,
  Website,
  WebsiteCategory,
  WebsiteFaq,
  WebsiteLocation,
  WebsitePage,
  WebsiteProduct,
  WebsiteSection,
  WebsiteTemplate,
} from '../../entities';
import { AuthModule } from '../../common/auth';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { UserWebsitesController, WebsitesController } from './websites.controller';
import { WebsitesService } from './websites.service';
import { WebsiteBootstrapService } from './website-bootstrap.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Website,
      TenantStaff,
      WebsiteTemplate,
      WebsitePage,
      WebsiteSection,
      WebsiteLocation,
      WebsiteProduct,
      WebsiteFaq,
      WebsiteCategory,
    ]),
    AuthModule,
    SubscriptionsModule,
  ],
  controllers: [UserWebsitesController, WebsitesController],
  providers: [WebsitesService, WebsiteBootstrapService],
  exports: [WebsitesService],
})
export class WebsitesModule {}
