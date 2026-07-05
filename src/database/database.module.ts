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
];

@Global()
@Module({
  imports: [TypeOrmModule.forFeature(entities)],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
