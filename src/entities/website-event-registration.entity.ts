import { CreateDateColumn, Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('website_event_registrations')
export class WebsiteEventRegistration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  website_id: string;

  @Column({ type: 'uuid' })
  group_id: string;

  @Column({ type: 'uuid' })
  occurrence_id: string;

  @Column({ type: 'uuid' })
  invitation_id: string;

  @Column({ type: 'uuid', nullable: true })
  buyer_user_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  payer_user_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  order_id: string | null;

  @Column({ type: 'varchar', length: 255 })
  attendee_name: string;

  @Column({ type: 'varchar', length: 320 })
  email: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  whatsapp: string | null;

  @Column({ type: 'jsonb', default: {} })
  selected_options: Record<string, string>;

  @Column({ type: 'varchar', length: 24, default: 'RSVP_CONFIRMED' })
  registration_status: 'RSVP_CONFIRMED' | 'CANCELLED' | 'REJECTED';

  @Column({ type: 'text', nullable: true })
  rejection_message: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  rejected_at: Date | null;

  @Column({ type: 'varchar', length: 24, default: 'UNPAID' })
  payment_status: 'UNPAID' | 'PENDING_PAYMENT' | 'PAID' | 'REFUNDED';

  @Column({ type: 'boolean', default: true })
  invoice_is_public: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  invoice_issued_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  invoice_email_sent_at: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
