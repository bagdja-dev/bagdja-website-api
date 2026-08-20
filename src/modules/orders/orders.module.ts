import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { WebsiteOrder, WebsiteProduct } from '../../entities';
import { AuthModule } from '../../common/auth';
import { EscrowModule } from '../escrow/escrow.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([WebsiteOrder, WebsiteProduct]),
    AuthModule,
    EscrowModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
