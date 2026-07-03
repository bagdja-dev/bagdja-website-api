import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import {
  Website,
  WebsitePage,
  WebsiteSection,
  WebsiteTemplate,
  TenantStaff,
  StaffInvitation,
  WebsiteProduct,
} from '../entities';

const entities = [
  Website,
  WebsitePage,
  WebsiteSection,
  WebsiteTemplate,
  TenantStaff,
  StaffInvitation,
  WebsiteProduct,
];

@Global()
@Module({
  imports: [TypeOrmModule.forFeature(entities)],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
