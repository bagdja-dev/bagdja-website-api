import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

import { WebsitePage } from './website-page.entity';

@Entity('website_sections')
export class WebsiteSection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  page_id: string;

  @ManyToOne(() => WebsitePage, (page) => page.sections, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'page_id' })
  page: WebsitePage;

  @Column({ type: 'varchar', length: 100 })
  type: string;

  @Column({ type: 'jsonb', default: {} })
  content: Record<string, unknown>;

  @Column({ type: 'int', default: 0 })
  order: number;

  /**
   * TRUE = section contoh dari template (bootstrap) yang belum diubah.
   * Jadi FALSE saat `type`/`content` di-PATCH; section buatan user selalu FALSE.
   * Dipakai `onboarding-status.homeEdited` (migration 20261105000004).
   */
  @Column({ type: 'boolean', default: false })
  is_seed: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
