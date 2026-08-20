import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';

import { WebsiteTransactionItem } from './website-transaction-item.entity';

/**
 * Website transaction — W2.8 (plan/website-builder/cart-and-implementation-payment-escrow.md).
 *
 * Pemisahan cart vs transaksi:
 * - `website_orders` = CART line (status PENDING/CANCELLED). Order yang sudah
 *   di-checkout punya `transaction_id` → tidak muncul di cart.
 * - `website_transactions` = 1 checkout: info pembeli (nama/alamat/HP), kurir,
 *   total, payment_mode, STATUS transaksi, escrow_id, payment_request_id,
 *   checkout_url. Escrow terikat ke TRANSACTION (1 transaksi = 1 escrow,
 *   amount = sum item), bukan ke order.
 * - `website_transaction_items` = item transaksi (link ke order + snapshot
 *   harga saat checkout).
 *
 * Status transaction pakai vocabulary yang sama dengan EscrowStatus
 * payment-service (PENDING_PAYMENT/HELD/COMPLETED/REFUNDED/CLOSED/DISPUTED) +
 * `CANCELLED` (state lokal saat gagal checkout) — sinkronisasi pull/polling
 * tinggal copy status escrow tanpa mapping.
 */
@Entity('website_transactions')
export class WebsiteTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  website_id: string;

  @Column({ type: 'uuid' })
  buyer_user_id: string;

  @Column({ type: 'varchar', nullable: true })
  buyer_identifier: string | null;

  // ── Info pengiriman (disimpan langsung di transaksi, bukan metadata) ──
  @Column({ type: 'varchar', nullable: true })
  recipient_name: string | null;

  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({ type: 'varchar', nullable: true })
  city: string | null;

  @Column({ type: 'varchar', nullable: true })
  district: string | null;

  @Column({ type: 'varchar', nullable: true })
  postal_code: string | null;

  @Column({ type: 'varchar', nullable: true })
  courier: string | null;

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

  /** PENDING_PAYMENT / HELD / COMPLETED / REFUNDED / CLOSED / DISPUTED / CANCELLED */
  @Column({ type: 'varchar', default: 'PENDING_PAYMENT' })
  status: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @OneToMany(() => WebsiteTransactionItem, (item) => item.transaction)
  items: WebsiteTransactionItem[];

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
