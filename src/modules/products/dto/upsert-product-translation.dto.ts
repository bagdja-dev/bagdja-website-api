import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class UpsertProductTranslationDto {
  @ApiProperty({ example: 'pomade-premium', maxLength: 255 })
  @IsString()
  @MaxLength(255)
  @Matches(/^$|^[a-z0-9]+(-[a-z0-9]+)*$/)
  slug: string;

  @ApiProperty({ example: 'Premium Pomade', maxLength: 255 })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ example: 'A premium styling pomade.', nullable: true })
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional({ example: '<p>Full product details.</p>', nullable: true })
  @IsOptional()
  @IsString()
  detail?: string | null;

  @ApiPropertyOptional({ maxLength: 255, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  seo_title?: string | null;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  seo_description?: string | null;

  @ApiPropertyOptional({ maxLength: 1000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  seo_image?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  seo_no_index?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_published?: boolean;
}
