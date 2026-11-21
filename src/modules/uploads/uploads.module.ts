import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../../common/auth';
import { TenantStaff } from '../../entities';
import { StorageModule } from '../storage/storage.module';

import { ArchiveUploadsController, UploadsController, VideoUploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';

@Module({
  imports: [TypeOrmModule.forFeature([TenantStaff]), AuthModule, StorageModule],
  controllers: [UploadsController, VideoUploadsController, ArchiveUploadsController],
  providers: [UploadsService],
})
export class UploadsModule {}
