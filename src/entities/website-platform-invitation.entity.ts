import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

import type { WebsitePlatformRole } from './website-platform-member.entity';

@Entity('website_platform_invitations')
@Index('uq_website_platform_invitations_token_hash', ['token_hash'], {
  unique: true,
})
export class WebsitePlatformInvitation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 320 })
  email: string;

  @Column({ type: 'varchar', length: 20 })
  role: WebsitePlatformRole;

  @Column({ type: 'varchar', length: 64 })
  token_hash: string;

  @Column({ type: 'uuid' })
  created_by: string;

  @Column({ type: 'timestamptz' })
  expires_at: Date;

  @Column({ type: 'uuid', nullable: true })
  accepted_by: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  accepted_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  revoked_at: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}

