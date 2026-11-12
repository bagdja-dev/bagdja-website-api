import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type WebsitePlatformRole = 'designer' | 'reviewer';

@Entity('website_platform_members')
@Index('uq_website_platform_members_user_id', ['user_id'], { unique: true })
@Index('uq_website_platform_members_email', ['email'], { unique: true })
export class WebsitePlatformMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ type: 'varchar', length: 320 })
  email: string;

  @Column({ type: 'varchar', length: 20 })
  role: WebsitePlatformRole;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @Column({ type: 'uuid', nullable: true })
  invited_by: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  accepted_at: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}

