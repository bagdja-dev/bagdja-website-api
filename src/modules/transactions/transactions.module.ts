import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import {
  WebsiteOrder,
  WebsiteProduct,
  WebsiteTransaction,
  WebsiteTransactionItem,
} from '../../entities';
import { AuthModule } from '../../common/auth';
import { EscrowModule } from '../escrow/escrow.module';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WebsiteTransaction,
      WebsiteTransactionItem,
      WebsiteOrder,
      WebsiteProduct,
    ]),
    AuthModule,
    EscrowModule,
  ],
  controllers: [TransactionsController],
  providers: [TransactionsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
