import { CreateDateColumn, Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity('website_event_invitations')
export class WebsiteEventInvitation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  website_id: string;

  @Column({ type: 'uuid' })
  group_id: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  invitee_name: string | null;

  @Column({ type: 'varchar', length: 320, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  whatsapp: string | null;

  @Column({ type: 'varchar', length: 64, unique: true })
  token_hash: string;

  @Column({ type: 'varchar', length: 16, default: 'PENDING' })
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';

  @Column({ type: 'varchar', length: 16, default: 'NOT_SENT' })
  email_delivery_status: 'NOT_SENT' | 'SENT' | 'FAILED' | 'MANUAL';

  @Column({ type: 'int', default: 1 })
  max_uses: number;

  @Column({ type: 'int', default: 0 })
  use_count: number;

  @Column({ type: 'timestamptz' })
  expires_at: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revoked_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  email_sent_at: Date | null;

  @Column({ type: 'text', nullable: true })
  delivery_error: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}