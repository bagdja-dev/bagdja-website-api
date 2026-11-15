import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { CANDIDATE_FIXTURES } from '../template-publication.client';

/** Respons 200 endpoint template submission Website Platform (dokumentasi Swagger). */

export class TemplateCheckIssueDto {
  @ApiProperty({ example: 'section_unknown' })
  code: string;

  @ApiProperty({ enum: ['error', 'warning'] })
  level: 'error' | 'warning';

  @ApiProperty({ example: 'Section "slider" tidak ada di katalog section Bagdja.' })
  message: string;

  @ApiPropertyOptional({ example: 'sections[3]' })
  field?: string;
}

export class TemplateCheckRenderDto {
  @ApiProperty({ enum: CANDIDATE_FIXTURES })
  fixture: string;

  @ApiProperty()
  ok: boolean;

  @ApiPropertyOptional({ example: 14571 })
  htmlBytes?: number;

  @ApiPropertyOptional({ example: 420 })
  durationMs?: number;

  @ApiPropertyOptional({ example: 'Template rendering failed.' })
  error?: string;
}

export class TemplateCheckPackageDto {
  @ApiProperty({ example: 'sha512-…' })
  integrity: string;

  @ApiProperty({ example: 21844 })
  serverBundleBytes: number;

  @ApiProperty({ example: 974, description: '0 bila package tidak membawa client bundle.' })
  clientBundleBytes: number;
}

export class TemplateCheckReportDto {
  @ApiProperty({ type: [TemplateCheckIssueDto] })
  issues: TemplateCheckIssueDto[];

  @ApiProperty({ type: [TemplateCheckRenderDto] })
  renders: TemplateCheckRenderDto[];

  @ApiPropertyOptional({ type: TemplateCheckPackageDto, nullable: true })
  package: TemplateCheckPackageDto | null;
}

export class TemplateSubmissionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  designer_user_id: string;

  @ApiPropertyOptional({ nullable: true })
  designer_email: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Dari manifest.json; terisi setelah Cek package lolos.' })
  name: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Dari manifest.json; terisi setelah Cek package lolos.' })
  slug: string | null;

  @ApiProperty({ example: '@bagdja/storefront-classic-template' })
  package_name: string;

  @ApiProperty({ example: '1.1.0' })
  package_version: string;

  @ApiProperty()
  description: string;

  @ApiProperty()
  changelog: string;

  @ApiProperty({ example: 'MIT' })
  license: string;

  @ApiPropertyOptional({ nullable: true })
  demo_url: string | null;

  @ApiPropertyOptional({ nullable: true })
  github_url: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'uuid' })
  discussion_topic_id: string | null;

  @ApiProperty({
    enum: [
      'draft', 'checking', 'check_failed', 'checked', 'submitted', 'in_review',
      'changes_requested', 'rejected', 'publishing', 'publish_failed', 'published',
      'deprecated', 'revoked',
    ],
  })
  status: string;

  @ApiPropertyOptional({ nullable: true })
  tarball_integrity: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Digest artefak yang direview dan yang dirilis.' })
  candidate_digest: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Manifest package tervalidasi.' })
  manifest: Record<string, unknown> | null;

  @ApiPropertyOptional({ type: TemplateCheckReportDto, nullable: true })
  check_report: TemplateCheckReportDto | null;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' })
  checked_at: Date | null;

  @ApiPropertyOptional({ nullable: true })
  artifact_digest: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Pesan galat publikasi terakhir (status publish_failed).' })
  publication_error: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' })
  published_at: Date | null;

  @ApiPropertyOptional({ nullable: true, format: 'uuid' })
  reviewer_user_id: string | null;

  @ApiPropertyOptional({ nullable: true })
  review_note: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' })
  submitted_at: Date | null;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' })
  reviewed_at: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  created_at: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updated_at: Date;
}

export class TemplateBrowserBundleDto {
  @ApiProperty({
    example: 'https://cdn.bagdja.com/<org>/<app>/<uuid>-kumpul-1.3.42-browser.js',
    description: 'URL publik browser.js (R2/CDN). Immutable: isi baru selalu URL baru.',
  })
  url: string;

  @ApiProperty({
    example: 'a3f1c2…(64 hex)',
    pattern: '^[a-f0-9]{64}$',
    description: 'SHA-256 hex isi browser.js. Renderer WAJIB menolak bundle yang hash-nya berbeda.',
  })
  sha256: string;
}

export class TemplateCandidatePreviewResponseDto {
  @ApiProperty({ format: 'uuid' })
  submissionId: string;

  @ApiProperty()
  digest: string;

  @ApiProperty({ enum: CANDIDATE_FIXTURES })
  fixture: string;

  @ApiProperty({
    enum: ['ssr', 'client'],
    description: '`client`: render di iframe pemanggil dari browserBundle + props (tanpa container). `ssr`: pakai html.',
  })
  mode: 'ssr' | 'client';

  @ApiProperty({ description: 'HTML hasil SSR dengan data fixture standar; string kosong pada mode client.' })
  html: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    description: 'Props fixture standar Bagdja (mode client); null pada mode SSR.',
  })
  props: Record<string, unknown> | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Isi dist/client.js kandidat (null bila tanpa JavaScript browser). Platform menjalankannya di iframe ' +
      'opaque (allow-scripts tanpa allow-same-origin) ber-CSP tanpa jaringan, hanya dengan data fixture.',
  })
  clientScript: string | null;
  @ApiPropertyOptional({
    type: TemplateBrowserBundleDto,
    nullable: true,
    description:
      'browser.js kandidat untuk pratinjau client rendering (template-client-rendering-plan §6). ' +
      'null bila template "rendering": "server" atau Cek package dijalankan sebelum fitur ini.',
  })
  browserBundle: TemplateBrowserBundleDto | null;
}

export class TemplateCandidateClientSourceResponseDto {
  @ApiProperty({ format: 'uuid' })
  submissionId: string;

  @ApiProperty()
  digest: string;

  @ApiPropertyOptional({ nullable: true, description: 'Isi dist/client.js; null bila package tanpa client bundle.' })
  content: string | null;

  @ApiProperty({ example: 974 })
  bytes: number;
}

export class TemplatePinnedWebsitesResponseDto {
  @ApiProperty({ format: 'uuid' })
  submissionId: string;

  @ApiPropertyOptional({ nullable: true, format: 'uuid' })
  versionId: string | null;

  @ApiProperty({ example: 3, description: 'Website yang berhenti dirender bila versi ini dicabut.' })
  pinnedWebsites: number;
}

export class TemplateVersionStatusResponseDto {
  @ApiProperty({ type: TemplateSubmissionResponseDto })
  submission: TemplateSubmissionResponseDto;

  @ApiProperty({ example: 3 })
  pinnedWebsites: number;
}
