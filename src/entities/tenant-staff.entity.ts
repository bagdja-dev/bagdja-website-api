import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';

import { Website } from './website.entity';

@Entity('tenant_staff')
@Unique(['website_id', 'user_id'])
export class TenantStaff {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  website_id: string;

  @ManyToOne(() => Website, (website) => website.staff, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'website_id' })
  website: Website;

  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ type: 'varchar', length: 320, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 50, default: 'viewer' })
  role: string;

  @Column({ type: 'jsonb', default: {} })
  permissions: Record<string, unknown>;

  @Column({ type: 'uuid', nullable: true })
  invited_by: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  invited_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  accepted_at: Date | null;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
