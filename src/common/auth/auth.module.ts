import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { JwtStrategy } from './jwt.strategy';
import { TenantStaffGuard } from './tenant-staff.guard';
import { RolesGuard } from './roles.guard';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: () => ({
        secret: process.env.JWT_SECRET ?? 'default-secret',
        signOptions: { expiresIn: '1h' },
      }),
    }),
  ],
  providers: [JwtStrategy, TenantStaffGuard, RolesGuard],
  exports: [TenantStaffGuard, RolesGuard],
})
export class AuthModule {}
