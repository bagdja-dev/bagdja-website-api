import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../../common/auth';
import {
  BusinessProfileWaitlist,
  TenantStaff,
  Website,
  WebsiteCategory,
  WebsiteFaq,
  WebsiteLocation,
  WebsitePage,
  WebsiteProduct,
  WebsiteSection,
  WebsiteTemplate,
  WebsiteTemplateVersion,
  WebsitePlatformTemplateSubmission,
  WebsiteEventGroup,
  WebsiteEventProductOption,
  WebsiteTransaction,
} from '../../entities';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

import { BusinessProfilesController } from './business-profiles.controller';
import { WebsiteBootstrapService } from './website-bootstrap.service';
import { WebsiteModulesService } from './website-modules.service';
import { WebsiteOnboardingService } from './website-onboarding.service';
import { WebsiteTemplateVersionService } from './website-template-version.service';
import { UserWebsitesController, WebsitesController } from './websites.controller';
import { WebsitesService } from './websites.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Website,
      TenantStaff,
      WebsiteTemplate,
      WebsiteTemplateVersion,
      WebsitePlatformTemplateSubmission,
      WebsitePage,
      WebsiteSection,
      WebsiteLocation,
      WebsiteProduct,
      WebsiteFaq,
      WebsiteCategory,
      WebsiteTransaction,
      WebsiteEventGroup,
      WebsiteEventProductOption,
      BusinessProfileWaitlist,
    ]),
    AuthModule,
    SubscriptionsModule,
  ],
  controllers: [UserWebsitesController, WebsitesController, BusinessProfilesController],
  providers: [
    WebsitesService,
    WebsiteBootstrapService,
    WebsiteModulesService,
    WebsiteOnboardingService,
    WebsiteTemplateVersionService,
  ],
  exports: [WebsitesService, WebsiteModulesService],
})
export class WebsitesModule {}
