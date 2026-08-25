import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

import { Website } from './website.entity';

@Entity('website_locations')
export class WebsiteLocation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  website_id: string;

  @ManyToOne(() => Website, (website) => website.locations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'website_id' })
  website: Website;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 50, default: 'branch' })
  type: string;

  @Column({ type: 'boolean', default: false })
  is_primary: boolean;

  @Column({ type: 'boolean', default: true })
  is_public: boolean;

  @Column({ type: 'varchar', length: 500, nullable: true })
  address_line: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  province: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  postal_code: string | null;

  /**
   * Nama area di bagdja-shipping-service (label lengkap hasil search, mis.
   * "Jakarta Selatan, DKI Jakarta") — BUKAN ID mentah. Setiap hitung ongkir,
   * nama ini di-re-search ke shipping-service untuk dapat providerAreaId
   * yang sedang valid (lihat plan/shipping-service/overview.md §6 isu #1,
   * opsi (b): re-lookup by name, tanpa tabel mapping).
   */
  @Column({ type: 'varchar', length: 255, nullable: true })
  shipping_area_name: string | null;

  /**
   * Kode kurir yang aktif untuk lokasi ini (mis. `['jne','sicepat']`), dipakai
   * sebagai filter `courier_code` saat panggil `bagdja-shipping-service`
   * `/shipping/cost`. Kosong = semua kurir default shipping-service dipakai
   * (lihat `RajaOngkirProvider.getCost` fallback list). Pindah dari level
   * Website ke level Lokasi (25 Agustus 2026) karena sekarang mendukung
   * >1 lokasi asal per website, tiap lokasi bisa beda cakupan kurir.
   */
  @Column({ type: 'jsonb', default: [] })
  active_couriers: string[];

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  latitude: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  longitude: number | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  whatsapp: string | null;

  @Column({ type: 'jsonb', default: {} })
  opening_hours: Record<string, unknown>;

  @Column({ type: 'varchar', length: 500, nullable: true })
  maps_url: string | null;

  @Column({ type: 'text', nullable: true })
  maps_embed: string | null;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @Column({ type: 'int', default: 0 })
  sort_order: number;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
