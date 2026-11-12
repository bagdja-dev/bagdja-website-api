import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class UpgradeWebsiteTemplateVersionDto {
  @ApiProperty({ format: 'uuid', description: 'ID versi tujuan (dari `latest.versionId`).' })
  @IsUUID()
  versionId: string;
}

export class WebsiteTemplateVersionSummaryDto {
  @ApiProperty({ format: 'uuid' })
  versionId: string;

  @ApiProperty({ example: '1.1.0' })
  version: string;

  @ApiProperty({ enum: ['published', 'deprecated', 'revoked'] })
  status: 'published' | 'deprecated' | 'revoked';

  @ApiPropertyOptional({ nullable: true, description: 'Changelog dari designer.' })
  changelog: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  publishedAt: Date;
}

export class WebsiteTemplateVersionStatusResponseDto {
  @ApiProperty({ format: 'uuid' })
  websiteId: string;

  @ApiPropertyOptional({ nullable: true, format: 'uuid' })
  templateId: string | null;

  @ApiPropertyOptional({ nullable: true, enum: ['builtin', 'package'] })
  source: 'builtin' | 'package' | null;

  @ApiPropertyOptional({ type: WebsiteTemplateVersionSummaryDto, nullable: true, description: 'Versi yang terpasang.' })
  current: WebsiteTemplateVersionSummaryDto | null;

  @ApiPropertyOptional({ type: WebsiteTemplateVersionSummaryDto, nullable: true, description: 'Versi published terbaru.' })
  latest: WebsiteTemplateVersionSummaryDto | null;

  @ApiProperty({ description: 'true bila ada versi published yang lebih baru dari yang terpasang.' })
  updateAvailable: boolean;
}
