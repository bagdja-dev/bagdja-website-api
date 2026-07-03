import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

/**
 * Wadah untuk registrasi entities (feature repositories).
 * Setiap kali menambah entity baru, tambahkan ke array `entities`
 * dan re-export lewat TypeOrmModule.forFeature agar bisa di-inject
 * di modul fitur (Websites, Pages, Sections, dsb.) pada Phase 2+.
 */
const entities: Array<new () => unknown> = [];

@Global()
@Module({
  imports: [TypeOrmModule.forFeature(entities)],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
