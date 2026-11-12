import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const PACKAGE_NAME_PATTERN =
  /^(?:@[a-z0-9](?:[a-z0-9._-]{0,61}[a-z0-9])?\/)?[a-z0-9](?:[a-z0-9._-]{0,61}[a-z0-9])?$/;
const EXACT_SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

/**
 * Pendaftaran package oleh designer. Nama dan slug template TIDAK diisi di sini:
 * keduanya dibaca dari `manifest.json` di tarball npm saat "Cek package".
 */
export class CreateTemplateSubmissionDto {
  @ApiProperty({ maxLength: 214, example: '@bagdja/storefront-demo' })
  @IsString()
  @MaxLength(214)
  @Matches(PACKAGE_NAME_PATTERN)
  packageName: string;

  @ApiProperty({ example: '1.2.3' })
  @IsString()
  @MaxLength(100)
  @Matches(EXACT_SEMVER_PATTERN, { message: 'packageVersion must be an exact semver version' })
  packageVersion: string;

  @ApiProperty({ maxLength: 3000 })
  @IsString()
  @MinLength(20)
  @MaxLength(3000)
  description: string;

  @ApiProperty({ maxLength: 2000 })
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  changelog: string;

  @ApiProperty({ maxLength: 80, example: 'MIT' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  license: string;

  @ApiPropertyOptional({ maxLength: 2048 })
  @IsOptional()
  @IsString()
  @IsUrl({ require_protocol: true })
  @MaxLength(2048)
  demoUrl?: string;

  @ApiProperty({ maxLength: 2048, example: 'https://github.com/bagdja/kumpul' })
  @IsString()
  @IsUrl({ require_protocol: true })
  @Matches(/^https:\/\/(www\.)?github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/, {
    message: 'githubUrl must be a GitHub repository URL',
  })
  @MaxLength(2048)
  githubUrl: string;
}
