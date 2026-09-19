import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import {
  User,
  Website,
  WebsitePage,
  WebsiteSection,
  WebsiteTemplate,
  TenantStaff,
  StaffInvitation,
  WebsiteProduct,
  WebsiteLocation,
  WebsiteFaq,
  WebsiteVendor,
  WebsiteVendorLocation,
  WebsiteProductLocation,
} from '../entities';

const entities = [
  User,
  Website,
  WebsitePage,
  WebsiteSection,
  WebsiteTemplate,
  TenantStaff,
  StaffInvitation,
  WebsiteProduct,
  WebsiteLocation,
  WebsiteFaq,
  WebsiteVendor,
  WebsiteVendorLocation,
  WebsiteProductLocation,
];

@Global()
@Module({
  imports: [TypeOrmModule.forFeature(entities)],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
