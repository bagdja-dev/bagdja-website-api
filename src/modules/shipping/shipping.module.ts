import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Website, WebsiteLocation, WebsiteOrder } from '../../entities';
import { AuthModule } from '../../common/auth';
import { ShippingClientService } from './shipping-client.service';
import { ShippingController } from './shipping.controller';

/**
 * Client + proxy controller ke bagdja-shipping-service — pola sama seperti
 * `EscrowModule` (escrow-client.service.ts) untuk bagdja-payment-service.
 * Diekspor supaya `PublicModule` bisa reuse `ShippingClientService` untuk
 * endpoint publik `GET /api/public/shipping/areas`.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([WebsiteOrder, WebsiteLocation, Website]),
    AuthModule,
  ],
  controllers: [ShippingController],
  providers: [ShippingClientService],
  exports: [ShippingClientService],
})
export class ShippingModule {}
