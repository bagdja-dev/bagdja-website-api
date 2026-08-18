import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TenantStaff, WebsiteProduct } from '../../entities';
import { AuthModule } from '../../common/auth';
import { EscrowClientService } from './escrow-client.service';

/**
 * PH-4 & PH-5 — escrow client untuk Website Builder.
 * Belum ada controller (checkout penuh di W4 plan website); module ini hanya
 * menyediakan EscrowClientService bagi module lain (products) yang butuh
 * resolve seller wallet & auto-provision Escrow Product.
 */
@Module({
  imports: [TypeOrmModule.forFeature([TenantStaff, WebsiteProduct]), AuthModule],
  providers: [EscrowClientService],
  exports: [EscrowClientService],
})
export class EscrowModule {}
