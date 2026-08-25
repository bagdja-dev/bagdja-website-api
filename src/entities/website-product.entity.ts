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

import { WebsiteCategory } from './website-category.entity';
import { Website } from './website.entity';

/** Satu cara/link pembayaran checkout — polymorphic per `payment_mode`. */
export interface LynkPaymentMeta {
  payment_mode: 'LYNK';
  payment_link: string;
}

export interface AddToCartPaymentMeta {
  payment_mode: 'ADD_TO_CART';
}

export interface EscrowPaymentMeta {
  payment_mode: 'ESCROW';
}

export type PaymentMetaEntry =
  | LynkPaymentMeta
  | AddToCartPaymentMeta
  | EscrowPaymentMeta;

@Entity('website_products')
export class WebsiteProduct {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  website_id: string;

  @ManyToOne(() => Website, (website) => website.products, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'website_id' })
  website: Website;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255 })
  slug: string;

  @Column({ type: 'varchar', length: 50, default: 'product' })
  type: string;

  @Column({ type: 'uuid', nullable: true })
  category_id: string | null;

  @ManyToOne(() => WebsiteCategory, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'category_id' })
  category: WebsiteCategory | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'text', nullable: true })
  detail: string | null;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: { to: (v: number) => v, from: (v: string) => parseFloat(v) },
  })
  price: number;

  @Column({ type: 'jsonb', default: [] })
  images: string[];

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @Column({ type: 'jsonb', default: [] })
  payment_meta: PaymentMetaEntry[];

  /** Kalau diisi, row ini adalah varian (mis. warna/ukuran) dari produk lain — lihat migration 20260806100001 untuk rasional (1 varian = 1 row penuh, calon 1 SKU POS nanti). Dibatasi maks. 1 level (validasi di ProductsService, bukan constraint DB). */
  @Column({ type: 'uuid', nullable: true })
  parent_product_id: string | null;

  @ManyToOne(() => WebsiteProduct, (product) => product.variants, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'parent_product_id' })
  parentProduct: WebsiteProduct | null;

  @OneToMany(() => WebsiteProduct, (product) => product.parentProduct)
  variants: WebsiteProduct[];

  @Column({ type: 'int', default: 0 })
  sort_order: number;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  /** Order Handling Phase 3 — SOP pengiriman kustom (nullable = tidak butuh tracking, mis. produk digital). */
  @Column({ type: 'uuid', nullable: true })
  fulfillment_flow_id: string | null;

  /** Order Handling Phase 3 §3.0.2 — masa garansi (hari) sebelum seller boleh force-release sisa dana kalau buyer tidak konfirm terima barang. Standar 3 hari (default DB + default form admin); null = force-release dinonaktifkan untuk produk ini (opt-out manual). */
  @Column({ type: 'int', nullable: true, default: 3 })
  final_release_guaranty_days: number | null;

  /** Berat produk dalam gram, untuk hitung ongkir (bagdja-shipping-service). Nullable — default 250g diterapkan di level aplikasi (ShippingController), bukan default DB, biar seller tidak wajib isi (plan/website-builder/integration-check-shipping-plan.md D2). */
  @Column({ type: 'int', nullable: true })
  weight_grams: number | null;

  /**
   * Dimensi produk dalam cm (panjang/lebar/tinggi), dipakai ShippingController
   * untuk hitung berat volumetrik ((p×l×t)/6000 dalam kg) — kurir menagih
   * berdasarkan berat AKTUAL atau volumetrik, mana yang lebih besar. Nullable
   * — default 30×30×5cm diterapkan di level aplikasi, bukan default DB.
   */
  @Column({ type: 'int', nullable: true })
  length_cm: number | null;

  @Column({ type: 'int', nullable: true })
  width_cm: number | null;

  @Column({ type: 'int', nullable: true })
  height_cm: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
