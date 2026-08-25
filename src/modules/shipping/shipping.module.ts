import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { WebsiteLocation, WebsiteOrder } from '../../entities';
import { AuthModule } from '../../common/auth';
import { ShippingClientService } from './shipping-client.service';
import { ShippingCalculationService } from './shipping-calculation.service';
import { ShippingController } from './shipping.controller';

/**
 * Client + proxy controller ke bagdja-shipping-service — pola sama seperti
 * `EscrowModule` (escrow-client.service.ts) untuk bagdja-payment-service.
 * Diekspor supaya `PublicModule` bisa reuse `ShippingClientService` (search
 * area publik) dan `TransactionsModule` bisa reuse `ShippingCalculationService`
 * (validasi cost server-side saat submit checkout).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([WebsiteOrder, WebsiteLocation]),
    AuthModule,
  ],
  controllers: [ShippingController],
  providers: [ShippingClientService, ShippingCalculationService],
  exports: [ShippingClientService, ShippingCalculationService],
})
export class ShippingModule {}
