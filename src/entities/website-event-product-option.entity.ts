import {
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
} from 'typeorm';

@Entity('website_event_product_options')
export class WebsiteEventProductOption {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  website_id: string;

  @Column({ type: 'uuid' })
  product_id: string;

  @Column({ type: 'varchar', length: 64 })
  option_group_key: string;

  @Column({ type: 'varchar', length: 64 })
  option_key: string;

  @Column({ type: 'varchar', length: 255 })
  label: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  price_per_seat: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  deposit_amount_per_seat: string;

  @Column({ type: 'varchar', length: 8, default: 'IDR' })
  currency: string;

  @Column({ type: 'int', default: 0 })
  min_attendees: number;

  @Column({ type: 'int' })
  max_attendees: number;

  @Column({ type: 'jsonb', default: {} })
  availability_window: Record<string, unknown>;

  @Column({ type: 'text', nullable: true })
  venue_location: string | null;

  @Column({ type: 'jsonb', default: [] })
  benefits: unknown[];

  @Column({ type: 'jsonb', default: {} })
  cancellation_policy: Record<string, unknown>;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @Column({ type: 'int', default: 0 })
  sort_order: number;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}