import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TenantStaff, StaffInvitation } from '../../entities';
import { AuthModule } from '../../common/auth';
import { StaffController, InvitationAcceptController } from './staff.controller';
import { StaffService } from './staff.service';

@Module({
  imports: [TypeOrmModule.forFeature([TenantStaff, StaffInvitation]), AuthModule],
  controllers: [StaffController, InvitationAcceptController],
  providers: [StaffService],
  exports: [StaffService],
})
export class StaffModule {}
