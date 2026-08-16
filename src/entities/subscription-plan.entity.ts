import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('subscription_plans')
export class SubscriptionPlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', unique: true })
  @Index('idx_subscription_plans_external_id')
  external_id: string;

  @Column({ type: 'text' })
  @Index('idx_subscription_plans_app_id')
  app_id: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'numeric', name: 'price_monthly' })
  price_monthly: number;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  metadata: Record<string, unknown>;

  @Column({ type: 'boolean', default: true })
  @Index('idx_subscription_plans_is_active')
  is_active: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  @Column({ type: 'timestamptz', nullable: true })
  synced_at: Date | null;
}
