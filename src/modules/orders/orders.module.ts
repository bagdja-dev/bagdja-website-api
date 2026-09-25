import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FulfillmentFlow, WebsiteLocation, WebsiteOrder, WebsiteOrderTermin, WebsiteProduct, WebsiteProductLocation, WebsiteVendor, WebsiteVendorLocation } from '../../entities';
import { WebsiteTransactionFulfillmentLog } from '../../entities/website-transaction-fulfillment-log.entity';
import { AuthModule } from '../../common/auth';
import { EscrowModule } from '../escrow/escrow.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { StorageModule } from '../storage/storage.module';
import { OrdersController } from './orders.controller';
import { TenantOrdersController } from './tenant-orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WebsiteOrder,
      WebsiteOrderTermin,
      FulfillmentFlow,
      WebsiteProduct,
      WebsiteLocation,
      WebsiteProductLocation,
      WebsiteVendor,
      WebsiteVendorLocation,
      WebsiteTransactionFulfillmentLog,
    ]),
    AuthModule,
    EscrowModule,
    NotificationsModule,
    // Step-complete Praorder (fulfillment-praorder-plan.md §2.1) hidup di
    // TransactionsService bareng seluruh logika Flow lainnya — tidak
    // menimbulkan circular import, TransactionsModule tidak import
    // OrdersModule sama sekali (dicek langsung sebelum nambah ini).
    TransactionsModule,
    StorageModule,
  ],
  controllers: [OrdersController, TenantOrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
