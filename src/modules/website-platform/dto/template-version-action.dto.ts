import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import { CANDIDATE_FIXTURES, type CandidateFixture } from '../template-publication.client';

export class DeprecateTemplateVersionDto {
  @ApiPropertyOptional({ maxLength: 2000, description: 'Alasan, ditampilkan di riwayat versi.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class RevokeTemplateVersionDto {
  @ApiProperty({
    maxLength: 2000,
    description: 'Alasan pencabutan (wajib). Website yang memakai versi ini berhenti dirender.',
  })
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  note: string;
}

export class PreviewTemplateCandidateQueryDto {
  @ApiProperty({ enum: CANDIDATE_FIXTURES, example: 'home' })
  @IsIn(CANDIDATE_FIXTURES)
  fixture: CandidateFixture;

  @ApiPropertyOptional({
    enum: ['ssr', 'client'],
    default: 'ssr',
    description:
      '`client`: bila kandidat punya browser.js, kembalikan props fixture + browserBundle (dirender di iframe ' +
      'pemanggil, tanpa container runtime). Kandidat tanpa browser.js tetap dijawab SSR.',
  })
  @IsOptional()
  @IsIn(['ssr', 'client'])
  mode?: 'ssr' | 'client';
}
