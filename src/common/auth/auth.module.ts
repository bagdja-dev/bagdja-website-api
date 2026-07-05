import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { UserModule } from '../../modules/user/user.module';
import { JwtAuthGuard } from './jwt-auth.guard';
import { TenantStaffGuard } from './tenant-staff.guard';
import { RolesGuard } from './roles.guard';

@Module({
  imports: [ConfigModule, UserModule],
  providers: [JwtAuthGuard, TenantStaffGuard, RolesGuard],
  exports: [JwtAuthGuard, TenantStaffGuard, RolesGuard, UserModule],
})
export class AuthModule {}
