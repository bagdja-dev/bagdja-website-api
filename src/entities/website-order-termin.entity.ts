import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

import { WebsiteOrder } from './website-order.entity';

export type WebsiteOrderTerminStatus = 'SCHEDULED' | 'ISSUED' | 'PAID' | 'CANCELLED';

/**
 * Termin 2..N (fulfillment-praorder-plan.md §2.4) — Termin 1 TIDAK masuk
 * sini, langsung jadi `total_amount` order/checkout normal. Baris di sini
 * murni data pendukung timeline (bukan halaman sendiri) — direnderkan
 * inline di progres Pascaorder lewat `anchor_step_name`.
 *
 * Juga dipakai untuk Tagihan Tambahan ad-hoc (§2.4.1) — beda cuma di
 * `status` awal (`ISSUED` langsung, bukan `SCHEDULED`) dan tidak ikut
 * validasi SUM=100% saat dibuat.
 */
@Entity('website_order_termins')
export class WebsiteOrderTermin {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  website_id: string;

  @Column({ type: 'uuid' })
  source_order_id: string;

  @ManyToOne(() => WebsiteOrder, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'source_order_id' })
  source_order: WebsiteOrder;

  /** 2, 3, ... — Termin 1 (DP) tidak pernah jadi baris di sini. */
  @Column({ type: 'int' })
  sequence: number;

  @Column({ type: 'varchar' })
  label: string;

  @Column({
    type: 'numeric',
    transformer: { to: (v: number) => v, from: (v: string) => parseFloat(v) },
  })
  amount: number;

  /** Step Pascaorder tempat Termin ini "disisipkan" di timeline — nullable, tidak terikat step manapun kalau kosong. */
  @Column({ type: 'varchar', nullable: true })
  anchor_step_name: string | null = null;

  @Column({ type: 'varchar', default: 'SCHEDULED' })
  status: WebsiteOrderTerminStatus = 'SCHEDULED';

  /** Terisi begitu buyer benar-benar bayar (transaksi direct-pay baru, terpisah dari transaksi asal). */
  @Column({ type: 'uuid', nullable: true })
  transaction_id: string | null = null;

  @Column({ type: 'timestamptz', nullable: true })
  issued_at: Date | null = null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
