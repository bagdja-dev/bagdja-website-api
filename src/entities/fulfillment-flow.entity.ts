import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';

import { FulfillmentFlowStep } from './fulfillment-flow-step.entity';

/**
 * Order Handling Phase 3 (plan/website-builder/order-hanlde-plan.md §3.2) —
 * Master Flow: SOP pengiriman kustom yang didesain seller, reusable lintas
 * produk dalam 1 website. Satu produk pakai satu Flow (atau tanpa Flow sama
 * sekali — lihat `website_products.fulfillment_flow_id`).
 */
@Entity('fulfillment_flows')
export class FulfillmentFlow {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  website_id: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @OneToMany(() => FulfillmentFlowStep, (step) => step.flow)
  steps: FulfillmentFlowStep[];

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
