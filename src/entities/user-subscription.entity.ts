import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { SubscriptionPlan } from './subscription-plan.entity';
import { User } from './user.entity';

@Entity('user_subscriptions')
@Check(`"status" IN ('active', 'canceled', 'past_due')`)
@Index('idx_user_subscriptions_unique_active', ['user'], {
  unique: true,
  where: '"status" = \'active\'',
})
export class UserSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  @Index('idx_user_subscriptions_user_id')
  user: User;

  @Column({ type: 'uuid', name: 'user_id' })
  user_id: string;

  @ManyToOne(() => SubscriptionPlan, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'plan_id' })
  @Index('idx_user_subscriptions_plan_id')
  plan: SubscriptionPlan;

  @Column({ type: 'uuid', name: 'plan_id' })
  plan_id: string;

  @Column({
    type: 'text',
    default: 'active',
  })
  @Index('idx_user_subscriptions_status')
  status: 'active' | 'canceled' | 'past_due';

  @Column({ type: 'timestamptz' })
  started_at: Date;

  @Column({ type: 'timestamptz' })
  ends_at: Date;

  @Column({ type: 'text', nullable: true })
  @Index('idx_user_subscriptions_external_id')
  external_subscription_id: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  @Column({ type: 'timestamptz', nullable: true })
  synced_at: Date | null;
}
