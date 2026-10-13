import { CreateDateColumn, Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('website_event_rsvp_challenges')
@Index('uq_website_event_rsvp_challenges_pending_contact', ['invitation_id', 'email'], {
  unique: true,
  where: "status = 'PENDING'",
})
export class WebsiteEventRsvpChallenge {
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

  @Column({ type: 'varchar', length: 320 })
  email: string;

  @Column({ type: 'varchar', length: 64 })
  code_hash: string;

  @Column({ type: 'jsonb' })
  reservation_data: {
    attendee_name: string;
    whatsapp: string | null;
    selected_options: Record<string, string>;
  };

  @Column({ type: 'varchar', length: 16, default: 'PENDING' })
  status: 'PENDING' | 'VERIFIED' | 'EXPIRED';

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ type: 'timestamptz' })
  expires_at: Date;

  @Column({ type: 'timestamptz' })
  last_sent_at: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
