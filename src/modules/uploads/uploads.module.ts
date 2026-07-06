import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../../common/auth';
import { TenantStaff } from '../../entities';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { SupabaseStorageService } from './supabase-storage.service';

@Module({
  imports: [TypeOrmModule.forFeature([TenantStaff]), AuthModule],
  controllers: [UploadsController],
  providers: [UploadsService, SupabaseStorageService],
  exports: [SupabaseStorageService],
})
export class UploadsModule {}
