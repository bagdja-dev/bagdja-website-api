import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** State machine plan/website-builder/template-submission-review-publication-flow.md §3. */
export type WebsitePlatformTemplateSubmissionStatus =
  | 'draft'
  | 'checking'
  | 'check_failed'
  | 'checked'
  | 'submitted'
  | 'in_review'
  | 'changes_requested'
  | 'rejected'
  | 'publishing'
  | 'publish_failed'
  | 'published'
  | 'deprecated'
  | 'revoked';

/** @deprecated Digantikan `status`; kolom dipertahankan sampai script penghapusan dijalankan. */
export type WebsitePlatformTemplatePublicationStatus =
  | 'not_started'
  | 'ready'
  | 'validating'
  | 'staged'
  | 'failed'
  | 'published'
  | 'withdrawn';

export type TemplateCheckIssueLevel = 'error' | 'warning';

export interface TemplateCheckReport {
  issues: Array<{ code: string; level: TemplateCheckIssueLevel; message: string; field?: string }>;
  renders: Array<{
    fixture: string;
    ok: boolean;
    htmlBytes?: number;
    durationMs?: number;
    error?: string;
  }>;
  package: {
    integrity: string;
    serverBundleBytes: number;
    clientBundleBytes: number;
  } | null;
}

@Entity('website_platform_template_submissions')
@Index('idx_website_platform_template_submissions_owner', ['designer_user_id', 'updated_at'])
@Index('idx_website_platform_template_submissions_queue', ['status', 'submitted_at'])
@Index(
  'uq_website_platform_template_submissions_package_version',
  ['package_name', 'package_version'],
  { unique: true },
)
@Index(
  'uq_website_platform_template_submissions_slug_version',
  ['slug', 'package_version'],
  { unique: true },
)
export class WebsitePlatformTemplateSubmission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  designer_user_id: string;

  @Column({ type: 'varchar', length: 320, nullable: true })
  designer_email: string | null;

  /** Dibaca dari manifest saat "Cek package"; NULL selama draft. */
  @Column({ type: 'varchar', length: 120, nullable: true })
  name: string | null;

  /** Dibaca dari manifest saat "Cek package"; NULL selama draft. */
  @Column({ type: 'varchar', length: 63, nullable: true })
  slug: string | null;

  @Column({ type: 'varchar', length: 214 })
  package_name: string;

  @Column({ type: 'varchar', length: 100 })
  package_version: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'text' })
  changelog: string;

  @Column({ type: 'varchar', length: 80 })
  license: string;

  @Column({ type: 'text', nullable: true })
  demo_url: string | null;

  @Column({ type: 'text', nullable: true })
  github_url: string | null;

  @Column({ type: 'uuid', nullable: true })
  discussion_topic_id: string | null;

  /** @deprecated lihat `status`. */
  @Column({ type: 'varchar', length: 20, default: 'not_started' })
  publication_status: WebsitePlatformTemplatePublicationStatus;

  @Column({ type: 'text', nullable: true })
  tarball_integrity: string | null;

  /** Digest artefak kandidat hasil intake; yang direview dan yang dirilis. */
  @Column({ type: 'char', length: 64, nullable: true })
  candidate_digest: string | null;

  /** Manifest package tervalidasi (`ExternalTemplatePackageManifest`). */
  @Column({ type: 'jsonb', nullable: true })
  manifest: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  check_report: TemplateCheckReport | null;

  @Column({ type: 'timestamptz', nullable: true })
  checked_at: Date | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  artifact_digest: string | null;

  @Column({ type: 'text', nullable: true })
  publication_error: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  published_at: Date | null;

  @Column({ type: 'varchar', length: 30, default: 'draft' })
  status: WebsitePlatformTemplateSubmissionStatus;

  @Column({ type: 'uuid', nullable: true })
  reviewer_user_id: string | null;

  @Column({ type: 'text', nullable: true })
  review_note: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  submitted_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  reviewed_at: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
