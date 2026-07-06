import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import {
  TenantStaff,
  Website,
  WebsiteFaq,
  WebsiteLocation,
  WebsitePage,
  WebsiteProduct,
  WebsiteSection,
  WebsiteTemplate,
} from '../../entities';
import { AuthModule } from '../../common/auth';
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
    ]),
    AuthModule,
  ],
  controllers: [UserWebsitesController, WebsitesController],
  providers: [WebsitesService, WebsiteBootstrapService],
  exports: [WebsitesService],
})
export class WebsitesModule {}
