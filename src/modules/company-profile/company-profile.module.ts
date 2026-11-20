import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../../common/auth';
import {
  WebsiteLanguage,
  WebsiteLocation,
  WebsitePartner,
  WebsitePartnerAccount,
  WebsitePartnerCategory,
  WebsitePartnerCategoryAssignment,
  WebsitePartnerTranslation,
  WebsitePortfolioProject,
  WebsitePortfolioProjectTranslation,
  WebsiteVendorLocation,
  Website,
} from '../../entities';

import { CompanyProfileController } from './company-profile.controller';
import { CompanyProfileService } from './company-profile.service';

@Module({
  imports: [TypeOrmModule.forFeature([
    Website,
    WebsiteLanguage,
    WebsiteLocation,
    WebsitePartner,
    WebsitePartnerAccount,
    WebsitePartnerCategory,
    WebsitePartnerCategoryAssignment,
    WebsitePartnerTranslation,
    WebsitePortfolioProject,
    WebsitePortfolioProjectTranslation,
    WebsiteVendorLocation,
  ]), AuthModule],
  controllers: [CompanyProfileController],
  providers: [CompanyProfileService],
  exports: [CompanyProfileService],
})
export class CompanyProfileModule {}
