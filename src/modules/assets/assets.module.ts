import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { WebsiteAsset, WebsiteOrderAssetDelivery, WebsiteProduct, WebsiteProductAsset } from '../../entities';
import { AuthModule } from '../../common/auth';
import { StorageModule } from '../storage/storage.module';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';
import { DigitalDeliveryService } from './digital-delivery.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([WebsiteAsset, WebsiteProductAsset, WebsiteProduct, WebsiteOrderAssetDelivery]),
    AuthModule,
    StorageModule,
  ],
  controllers: [AssetsController],
  providers: [AssetsService, DigitalDeliveryService],
  exports: [AssetsService, DigitalDeliveryService],
})
export class AssetsModule {}