import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TenantStaff, WebsiteProduct } from '../../entities';
import { AuthModule } from '../../common/auth';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { EscrowModule } from '../escrow/escrow.module';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([WebsiteProduct, TenantStaff]),
    AuthModule,
    SubscriptionsModule,
    EscrowModule,
  ],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
