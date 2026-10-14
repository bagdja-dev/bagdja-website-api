import { CreateDateColumn, Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity('website_event_groups')
export class WebsiteEventGroup {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  website_id: string;

  @Column({ type: 'uuid' })
  product_id: string;

  @Column({ type: 'uuid' })
  initiator_user_id: string;

  /** Order rencana initiator di cart (`website_orders` PENDING, tanpa seat). Null untuk plan lama sebelum gathering masuk cart. */
  @Column({ type: 'uuid', nullable: true })
  order_id: string | null;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  invitation_banner_url: string | null;

  @Column({ type: 'text', nullable: true })
  invitation_description: string | null;

  @Column({ type: 'varchar', length: 32, default: 'PREORDER' })
  status: string;

  @Column({ type: 'varchar', length: 16, default: 'OPEN' })
  invite_policy: 'OPEN' | 'INVITE_ONLY';

  @Column({ type: 'varchar', length: 32, default: 'PLAN' })
  workflow_step: 'PLAN' | 'INVITATIONS' | 'INVITATION_CONFIRMATION' | 'PAYMENT_CONFIRMATION' | 'LOCKED';

  @Column({ type: 'timestamptz', nullable: true })
  invitation_submitted_at: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}