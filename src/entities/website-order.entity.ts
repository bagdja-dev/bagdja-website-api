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
import { WebsiteProduct } from './website-product.entity';

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

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
