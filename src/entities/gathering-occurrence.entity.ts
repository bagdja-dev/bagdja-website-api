import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type GatheringOccurrenceStatus =
  | 'DRAFT'
  | 'PREORDER'
  | 'RSVP_OPEN'
  | 'PAYMENT_OPEN'
  | 'CONFIRMED'
  | 'COMPLETED'
  | 'CANCELLED';

@Entity('website_gathering_occurrences')
export class GatheringOccurrence {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  website_id: string;

  @Column({ type: 'uuid' })
  product_id: string;

  @Column({ type: 'uuid' })
  parent_order_id: string;

  @Column({ type: 'uuid' })
  initiator_user_id: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({
    type: 'varchar',
    length: 32,
    default: 'DRAFT',
  })
  status: GatheringOccurrenceStatus;

  @Column({ type: 'timestamptz', nullable: true })
  rsvp_open_at?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  rsvp_close_at?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  payment_deadline?: Date;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  price_per_seat: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  deposit_amount_per_seat: number;

  @Column({ type: 'varchar', length: 8, default: 'IDR' })
  currency: string;

  @Column({ type: 'int', default: 0 })
  min_attendees: number;

  @Column({ type: 'int' })
  max_attendees: number;

  @Column({ type: 'text', nullable: true })
  final_location?: string;

  @Column({ type: 'timestamptz', nullable: true })
  final_schedule?: Date | null;

  @Column({ type: 'jsonb', default: {} })
  cancellation_policy_snapshot: Record<string, any>;

  @Column({ type: 'jsonb', default: [] })
  option_groups_snapshot: Record<string, any>[];

  @Column({ type: 'jsonb', default: [] })
  opened_option_ids_snapshot: string[];

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
