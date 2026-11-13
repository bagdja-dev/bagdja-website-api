import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsUUID, MaxLength } from 'class-validator';

const CANDIDATE_STATUSES = ['checked', 'submitted', 'in_review', 'publishing', 'publish_failed'];

export class StartTemplateTrialDto {
  @ApiProperty({ format: 'uuid', description: 'ID pengajuan kandidat (dari `GET /api/template-candidates`).' })
  @IsUUID()
  submissionId: string;
}

export class TemplateCandidateResponseDto {
  @ApiProperty({ format: 'uuid', description: 'ID pengajuan template.' })
  submissionId: string;

  @ApiProperty({ example: 'kumpul' })
  slug: string;

  @ApiProperty({ example: 'Kumpul' })
  name: string;

  @ApiProperty({ example: '1.3.0', description: 'Versi package kandidat.' })
  version: string;

  @ApiProperty()
  description: string;

  @ApiProperty({ description: 'Yang baru di versi ini.' })
  changelog: string;

  @ApiProperty({ enum: CANDIDATE_STATUSES })
  status: string;

  @ApiProperty({ example: 'Sedang direview' })
  statusLabel: string;

  @ApiProperty({
    enum: ['designer', 'reviewer'],
    description: 'Alasan user ini boleh melihat kandidat: pengaju, atau reviewer yang mengambil pengajuan.',
  })
  viewerRole: 'designer' | 'reviewer';

  @ApiProperty({ type: [String], example: ['event_organizer'] })
  businessProfiles: string[];

  @ApiProperty({ type: [String], description: 'Halaman sistem yang dirender template (manifest kandidat).' })
  pageOverrides: string[];

  @ApiProperty({ description: 'true bila kandidat membawa dist/client.js.' })
  hasClientScript: boolean;

  @ApiPropertyOptional({ nullable: true })
  previewImageUrl: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: '1.2.0',
    description: 'Versi terbit terbaru template yang sama; null bila template belum pernah terbit.',
  })
  publishedVersion: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  submittedAt: Date | null;

  @ApiPropertyOptional({
    nullable: true,
    type: 'object',
    additionalProperties: true,
    description: 'Palet bawaan versi kandidat (`manifest.theme`); null bila tidak dideklarasikan.',
    example: { mode: 'light', colors: { background: '#ffffff', accent: '#00608e' } },
  })
  theme: object | null;
}

export class WebsiteTemplateTrialResponseDto {
  @ApiProperty({ format: 'uuid' })
  websiteId: string;

  @ApiPropertyOptional({
    type: TemplateCandidateResponseDto,
    nullable: true,
    description: 'Kandidat yang sedang diuji dan boleh dilihat user ini; null bila tidak ada uji.',
  })
  candidate: TemplateCandidateResponseDto | null;

  @ApiProperty({
    description: 'true bila website sedang menguji kandidat yang tidak boleh dilihat user ini (milik designer/reviewer lain).',
  })
  hiddenFromYou: boolean;
}

export class TemplateTrialRuntimeResponseDto {
  @ApiProperty({ example: 'kumpul' })
  slug: string;

  @ApiProperty({ example: '1.3.0' })
  version: string;

  @ApiProperty({ enum: ['candidate'] })
  status: 'candidate';

  @ApiProperty({ type: [String] })
  pageOverrides: string[];

  @ApiProperty({ description: 'Digest artefak kandidat untuk runtime `/v1/render-candidate`.' })
  candidateDigest: string;

  @ApiProperty({ example: 'Kumpul' })
  name: string;

  @ApiProperty({
    enum: ['designer', 'reviewer', 'tester', 'reviewer_team'],
    description: 'Dasar akses: designer, reviewer pemegang, tim penguji designer, atau reviewer lain.',
  })
  viewerRole: 'designer' | 'reviewer' | 'tester' | 'reviewer_team';

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description: 'Palet bawaan versi kandidat, dipakai renderer sebagai `templateTheme`.',
  })
  theme?: object;
}

export class TemplateTrialRuntimeEnvelopeDto {
  @ApiPropertyOptional({
    type: TemplateTrialRuntimeResponseDto,
    nullable: true,
    description: 'Runtime kandidat untuk viewer ini; null bila website tidak sedang menguji atau viewer tidak berhak.',
  })
  runtime: TemplateTrialRuntimeResponseDto | null;
}

export class TemplatePublishedVersionOptionDto {
  @ApiProperty({ format: 'uuid', description: 'ID versi untuk `POST /api/websites/:id/template-version/select`.' })
  versionId: string;

  @ApiProperty({ example: '1.2.0' })
  version: string;

  @ApiPropertyOptional({ nullable: true, description: 'Changelog dari designer.' })
  changelog: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  publishedAt: Date;

  @ApiProperty({ description: 'true untuk versi terbit terbaru.' })
  latest: boolean;
}

export class TemplateVersionOptionsResponseDto {
  @ApiProperty({ example: 'kumpul' })
  slug: string;

  @ApiPropertyOptional({ nullable: true, format: 'uuid', description: 'null bila template belum pernah terbit.' })
  templateId: string | null;

  @ApiProperty({
    type: [TemplatePublishedVersionOptionDto],
    description: 'Versi terbit yang bisa dipasang (tanpa deprecated/revoked), terbaru lebih dulu. Seller bebas memilih versi mana pun.',
  })
  published: TemplatePublishedVersionOptionDto[];

  @ApiProperty({
    type: [TemplateCandidateResponseDto],
    description: 'Versi kandidat template ini yang boleh diuji user (designer sejak lolos Cek package; reviewer yang mengambil).',
  })
  candidates: TemplateCandidateResponseDto[];
}

export class AddTemplateTesterDto {
  @ApiProperty({ example: 'penguji@contoh.com', description: 'Email akun Bagdja penguji (dicocokkan saat login).' })
  @IsEmail()
  @MaxLength(320)
  email: string;
}

export class TemplateTesterResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'penguji@contoh.com' })
  email: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;
}

export class TemplateTrialWebsiteResponseDto {
  @ApiProperty({ example: 'Toko Uji' })
  websiteName: string;

  @ApiProperty({ example: 'toko-uji', description: 'Slug website; tautan = alamat website tenant.' })
  websiteSlug: string;

  @ApiProperty({ example: 'Kumpul' })
  templateName: string;

  @ApiProperty({ example: '1.2.7' })
  version: string;

  @ApiProperty({ example: 'Menunggu review' })
  statusLabel: string;
}

export class TemplateTesterTeamResponseDto {
  @ApiProperty({ type: [TemplateTesterResponseDto], description: 'Tim penguji designer (maks. 10).' })
  testers: TemplateTesterResponseDto[];

  @ApiProperty({
    type: [TemplateTrialWebsiteResponseDto],
    description: 'Website yang sedang menguji versi milik designer — bagikan tautannya ke penguji.',
  })
  trialWebsites: TemplateTrialWebsiteResponseDto[];

  @ApiProperty({ example: 10 })
  maxTesters: number;
}
