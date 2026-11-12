import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type WebsitePlatformAccessRequestStatus =
  'pending' | 'curating' | 'invited' | 'discussion' | 'approved' | 'rejected';

@Entity('website_platform_access_requests')
@Index('idx_website_platform_access_requests_status_created', ['status', 'created_at'])
export class WebsitePlatformAccessRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 320 })
  email: string;

  @Column({ type: 'uuid', nullable: true })
  applicant_user_id: string | null;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'text', nullable: true })
  portfolio_url: string | null;

  @Column({ type: 'text', nullable: true })
  message: string | null;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: WebsitePlatformAccessRequestStatus;

  @Column({ type: 'uuid', nullable: true })
  reviewed_by: string | null;

  @Column({ type: 'text', nullable: true })
  review_note: string | null;

  @Column({ type: 'uuid', nullable: true })
  assigned_to_user_id: string | null;

  @Column({ type: 'varchar', length: 320, nullable: true })
  assigned_to_name: string | null;

  @Column({ type: 'text', nullable: true })
  internal_notes: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  discussion_checklist: string[];

  @Column({ type: 'uuid', nullable: true })
  invitation_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  discussion_topic_id: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
