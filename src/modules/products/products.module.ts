import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FulfillmentFlow, ProductUom, TenantStaff, WebsiteProduct, WebsiteProductLocation, WebsiteLocation, WebsiteEventProductOption } from '../../entities';
import { AuthModule } from '../../common/auth';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { EscrowModule } from '../escrow/escrow.module';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { GatheringProductOptionsService } from './gathering-product-options.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WebsiteProduct,
      WebsiteProductLocation,
      WebsiteLocation,
      TenantStaff,
      FulfillmentFlow,
      ProductUom,
      WebsiteEventProductOption,
    ]),
    AuthModule,
    SubscriptionsModule,
    EscrowModule,
  ],
  controllers: [ProductsController],
  providers: [ProductsService, GatheringProductOptionsService],
  exports: [ProductsService],
})
export class ProductsModule {}
