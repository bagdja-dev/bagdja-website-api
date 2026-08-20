import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TenantStaff, Website } from '../../entities';
import { AuthModule } from '../../common/auth';
import { EscrowClientService } from './escrow-client.service';

/**
 * PH-4 & PH-5 & W2 — escrow client untuk Website Builder.
 * Module ini tidak punya controller sendiri; menyediakan `EscrowClientService`
 * bagi module lain: `ProductsModule` (resolve seller wallet & auto-provision
 * Escrow Product per website) dan `TransactionsModule` (create escrow +
 * initialize payment + baca status escrow saat checkout, W2).
 */
@Module({
  imports: [TypeOrmModule.forFeature([TenantStaff, Website]), AuthModule],
  providers: [EscrowClientService],
  exports: [EscrowClientService],
})
export class EscrowModule {}
