import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../../common/auth';
import { Website, WebsiteAndroidApp } from '../../entities';
import { StorageModule } from '../storage/storage.module';

import { AndroidAppsController } from './android-apps.controller';
import { AndroidAppsService } from './android-apps.service';
import { AndroidBuilderClientService } from './android-builder-client.service';
import { KeystoreSecretsService } from './keystore-secrets.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Website, WebsiteAndroidApp]),
    AuthModule,
    StorageModule,
  ],
  controllers: [AndroidAppsController],
  providers: [AndroidAppsService, AndroidBuilderClientService, KeystoreSecretsService],
})
export class AndroidAppsModule {}
