import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../../common/auth';
import {
  WebsiteLocation,
  WebsitePartner,
  WebsiteVendorLocation,
} from '../../entities';

import { VendorsController } from './vendors.controller';
import { VendorsService } from './vendors.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([WebsitePartner, WebsiteVendorLocation, WebsiteLocation]),
    AuthModule,
  ],
  controllers: [VendorsController],
  providers: [VendorsService],
  exports: [VendorsService],
})
export class VendorsModule {}
