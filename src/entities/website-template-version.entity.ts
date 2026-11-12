import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

import { WebsiteTemplate } from './website-template.entity';

export type WebsiteTemplateVersionStatus = 'published' | 'deprecated' | 'revoked';

/**
 * Satu versi template eksternal yang terbit
 * (plan/website-builder/template-submission-review-publication-flow.md §5.1).
 */
@Entity('website_template_version')
@Index('uq_website_template_version_template_version', ['template_id', 'version'], { unique: true })
@Index('idx_website_template_version_catalog', ['template_id', 'status', 'published_at'])
export class WebsiteTemplateVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  template_id: string;

  @ManyToOne(() => WebsiteTemplate, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'template_id' })
  template?: WebsiteTemplate;

  @Column({ type: 'varchar', length: 100 })
  version: string;

  @Column({ type: 'char', length: 64 })
  artifact_digest: string;

  /** Manifest package tervalidasi (`ExternalTemplatePackageManifest`). */
  @Column({ type: 'jsonb' })
  manifest: Record<string, unknown>;

  @Column({ type: 'uuid', unique: true })
  submission_id: string;

  @Column({ type: 'varchar', length: 20, default: 'published' })
  status: WebsiteTemplateVersionStatus;

  @Column({ type: 'text', nullable: true })
  status_note: string | null;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  published_at: Date;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  status_changed_at: Date;
}
