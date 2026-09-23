import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export const FULFILLMENT_EVENT_TYPES = [
  'STEP_COMPLETED',
  'STEP_DRAFT',
  'RELEASE_APPROVED',
  'STEP_DISPUTED',
  'QUOTE_SET',
  'DELIVERED',
] as const;

export type FulfillmentEventType = (typeof FULFILLMENT_EVENT_TYPES)[number];

export type ReleaseApprovedBy = 'buyer' | 'seller_guaranty';

/**
 * Order Handling Phase 3 (plan/website-builder/order-hanlde-plan.md §3.2) —
 * SATU-SATUNYA sumber kebenaran progress fulfillment, dicatat per
 * (transaction_id, order_id) langsung — TIDAK ADA tabel groups terpisah;
 * grouping per Flow di UI dihitung on-the-fly dari `product.fulfillment_flow_id`.
 *
 * `step_name` SNAPSHOT teks (bukan FK ke fulfillment_flow_steps.id) supaya
 * catatan historis independen dari definisi flow yang bisa diedit/dihapus
 * nanti (trade-off didokumentasikan di §3.0 — keputusan E2, pakai flow live).
 */
@Entity('website_transaction_fulfillment_logs')
export class WebsiteTransactionFulfillmentLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Nullable — step Praorder dicatat sebelum ada transaksi sama sekali (fulfillment-praorder-plan.md §2.1). Query selalu by `order_id`, bukan ini. */
  @Column({ type: 'uuid', nullable: true })
  transaction_id: string | null;

  @Column({ type: 'uuid' })
  order_id: string;

  @Column({ type: 'varchar' })
  event_type: FulfillmentEventType;

  @Column({ type: 'varchar', nullable: true })
  step_name: string | null;

  @Column({ type: 'jsonb', nullable: true })
  form_data: Record<string, unknown> | null;

  @Column({
    type: 'numeric',
    nullable: true,
    transformer: {
      to: (v: number | null) => v,
      from: (v: string | null) => (v === null ? null : parseFloat(v)),
    },
  })
  release_amount: number | null;

  @Column({ type: 'varchar', nullable: true })
  release_approved_by: ReleaseApprovedBy | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
