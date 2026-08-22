import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

import { FulfillmentFlow } from './fulfillment-flow.entity';

/** Definisi 1 field form dinamis — diisi seller saat menandai step ini selesai. */
export interface FulfillmentStepFormField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'textarea' | 'select';
  required?: boolean;
  options?: string[]; // untuk type 'select'
}

/**
 * Order Handling Phase 3 (plan/website-builder/order-hanlde-plan.md §3.0/§3.2)
 * — satu langkah dalam Flow, berurutan via `sequence`. `release_percentage`/
 * `guaranty_days` opsional — lihat §3.0.1 (pelepasan dana bertahap, buyer
 * approve atau seller force-release setelah masa garansi lewat).
 */
@Entity('fulfillment_flow_steps')
export class FulfillmentFlowStep {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  flow_id: string;

  @ManyToOne(() => FulfillmentFlow, (flow) => flow.steps, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'flow_id' })
  flow: FulfillmentFlow;

  @Column({ type: 'int' })
  sequence: number;

  @Column({ type: 'varchar' })
  status_name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** Estimasi hari — informasi saja, TIDAK ada alert/deadline otomatis (keputusan E3). */
  @Column({ type: 'int', nullable: true })
  process_day: number | null;

  @Column({ type: 'jsonb', nullable: true })
  form_schema: FulfillmentStepFormField[] | null;

  /** % dari total amount GRUP (bukan total transaksi) yang boleh dirilis begitu step ini disetujui — §3.0.1. */
  @Column({
    type: 'numeric',
    nullable: true,
    transformer: {
      to: (v: number | null) => v,
      from: (v: string | null) => (v === null ? null : parseFloat(v)),
    },
  })
  release_percentage: number | null;

  /** Batas hari buyer approve sebelum seller boleh force-release sendiri — cuma relevan kalau release_percentage diisi. */
  @Column({ type: 'int', nullable: true })
  guaranty_days: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
