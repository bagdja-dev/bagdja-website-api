import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

import { WebsiteLocation } from './website-location.entity';
import { WebsitePartner } from './website-partner.entity';
import { WebsiteProduct } from './website-product.entity';
import { Website } from './website.entity';

/**
 * Order = 1 checkout buyer login untuk 1 produk (W2, MVP: 1 order = 1
 * produk). `escrow_id` 1:1 dengan order — escrow terikat ke ORDER, bukan
 * ke produk. `status` pakai vocabulary sama dengan EscrowStatus
 * payment-service (PENDING/HELD/COMPLETED/REFUNDED/CLOSED/DISPUTED) +
 * `CANCELLED` (state lokal sebelum/saat gagal checkout) — lihat
 * plan/website-builder/cart-and-implementation-payment-escrow.md §2.3.
 */
@Entity('website_orders')
export class WebsiteOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  website_id: string;

  @ManyToOne(() => Website, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'website_id' })
  website: Website;

  @Column({ type: 'uuid' })
  product_id: string;

  @ManyToOne(() => WebsiteProduct)
  @JoinColumn({ name: 'product_id' })
  product: WebsiteProduct;

  @Column({ type: 'uuid', nullable: true })
  location_id: string | null;

  @ManyToOne(() => WebsiteLocation, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'location_id' })
  location: WebsiteLocation | null;

  @Column({ type: 'uuid', nullable: true })
  vendor_id: string | null;

  @ManyToOne(() => WebsitePartner, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'vendor_id' })
  vendor: WebsitePartner | null;

  @Column({ type: 'uuid' })
  buyer_user_id: string;

  @Column({ type: 'varchar', nullable: true })
  buyer_identifier: string | null;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  @Column({
    type: 'numeric',
    transformer: { to: (v: number) => v, from: (v: string) => parseFloat(v) },
  })
  unit_price: number;

  @Column({
    type: 'numeric',
    transformer: { to: (v: number) => v, from: (v: string) => parseFloat(v) },
  })
  total_amount: number;

  /** Harga final quotation keseluruhan; berbeda dari nominal checkout pertama (DP). */
  @Column({
    type: 'numeric',
    nullable: true,
    transformer: { to: (v: number | null) => v, from: (v: string | null) => (v === null ? null : parseFloat(v)) },
  })
  quoted_total_amount: number | null;

  @Column({ type: 'varchar', default: 'IDR' })
  currency: string;

  @Column({ type: 'varchar' })
  payment_mode: 'ADD_TO_CART' | 'ESCROW';

  @Column({ type: 'uuid', nullable: true })
  payment_request_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  escrow_id: string | null;

  @Column({ type: 'text', nullable: true })
  checkout_url: string | null;

  @Column({ type: 'varchar', default: 'PENDING' })
  status: string;

  /** W2.8: transaksi yang meng-claim order ini (checkout) — kalau terisi,
   *  order tidak lagi muncul di cart (hanya PENDING && transaction_id IS NULL). */
  @Column({ type: 'uuid', nullable: true })
  transaction_id: string | null;

  /** Gathering: order seat peserta menunjuk ke order rencana initiator. Null untuk order biasa. */
  @Column({ type: 'uuid', nullable: true })
  parent_order_id: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  /** Jadwal jasa (field flow ber-`calendar_role`), untuk kalender pembeli & penjual. */
  @Column({ type: 'timestamptz', nullable: true })
  scheduled_start_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  scheduled_end_at: Date | null;

  /** true = jadwal dari field `tanggal` (tanpa jam). */
  @Column({ type: 'boolean', default: false })
  scheduled_all_day: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
