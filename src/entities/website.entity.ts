import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';

import { WebsiteTemplate } from './website-template.entity';
import { WebsitePage } from './website-page.entity';
import { TenantStaff } from './tenant-staff.entity';
import { WebsiteProduct } from './website-product.entity';
import { WebsiteLocation } from './website-location.entity';
import { WebsiteFaq } from './website-faq.entity';
import { WebsiteCategory } from './website-category.entity';

@Entity('websites')
export class Website {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  slug: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  domain: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  domain_verification_token: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  domain_verified_at: Date | null;

  @Column({ type: 'uuid', nullable: true })
  template_id: string | null;

  @ManyToOne(() => WebsiteTemplate, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'template_id' })
  template: WebsiteTemplate | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  tagline: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  logo_url: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  whatsapp: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 320, nullable: true })
  email: string | null;

  @Column({ type: 'jsonb', default: {} })
  social_links: Record<string, unknown>;

  @Column({ type: 'jsonb', default: {} })
  opening_hours: Record<string, unknown>;

  @Column({ type: 'jsonb', default: {} })
  theme: Record<string, unknown>;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  /**
   * Escrow Product canonical (bagdja-payment-service `escrow_products`) milik
   * website ini — satu untuk SEMUA produknya, bukan per-produk. Auto-provision
   * (nama = nama website) di `EscrowClientService.ensureEscrowProductForWebsite`
   * kalau masih kosong.
   */
  @Column({ type: 'uuid', nullable: true })
  escrow_product_id: string | null;

  /**
   * Kode kurir yang aktif untuk website ini (mis. `['jne','sicepat']`),
   * dipakai sebagai filter `courier_code` saat panggil `bagdja-shipping-service`
   * `/shipping/cost`. Kosong/null = semua kurir default shipping-service
   * dipakai (lihat `RajaOngkirProvider.getCost` fallback list).
   */
  @Column({ type: 'jsonb', default: [] })
  active_couriers: string[];

  @OneToMany(() => WebsitePage, (page) => page.website)
  pages: WebsitePage[];

  @OneToMany(() => TenantStaff, (staff) => staff.website)
  staff: TenantStaff[];

  @OneToMany(() => WebsiteProduct, (product) => product.website)
  products: WebsiteProduct[];

  @OneToMany(() => WebsiteLocation, (location) => location.website)
  locations: WebsiteLocation[];

  @OneToMany(() => WebsiteFaq, (faq) => faq.website)
  faqs: WebsiteFaq[];

  @OneToMany(() => WebsiteCategory, (category) => category.website)
  categories: WebsiteCategory[];

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
