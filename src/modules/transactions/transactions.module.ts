import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import {
  FulfillmentFlow,
  TenantStaff,
  Website,
  WebsiteOrder,
  WebsiteProduct,
  WebsiteTransaction,
  WebsiteTransactionFulfillmentLog,
  WebsiteTransactionItem,
} from '../../entities';
import { AuthModule } from '../../common/auth';
import { EscrowModule } from '../escrow/escrow.module';
import { ShippingModule } from '../shipping/shipping.module';
import { TenantTransactionsController } from './tenant-transactions.controller';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WebsiteTransaction,
      WebsiteTransactionItem,
      WebsiteOrder,
      WebsiteProduct,
      Website,
      TenantStaff,
      FulfillmentFlow,
      WebsiteTransactionFulfillmentLog,
    ]),
    AuthModule,
    EscrowModule,
    ShippingModule,
  ],
  controllers: [TransactionsController, TenantTransactionsController],
  providers: [TransactionsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
