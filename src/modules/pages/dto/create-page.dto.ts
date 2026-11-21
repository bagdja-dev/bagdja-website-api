import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

export class CreatePageDto {
  @ApiPropertyOptional({ example: 'About page identity' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiProperty({ example: 'Home' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiProperty({ example: 'home' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, { message: 'Slug must be lowercase alphanumeric with hyphens' })
  slug: string;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  seo_title?: string | null;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  seo_description?: string | null;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  seo_image?: string | null;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  seo_no_index?: boolean;

  @ApiPropertyOptional({ example: 'internal', enum: ['internal', 'external'], default: 'internal' })
  @IsOptional()
  @IsIn(['internal', 'external'])
  link_mode?: 'internal' | 'external';

  @ApiPropertyOptional({ example: 'https://company.example.com/report', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  external_url?: string | null;

  @ApiPropertyOptional({ default: {} })
  @IsOptional()
  @IsObject()
  content?: Record<string, unknown>;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  is_home?: boolean;

  @ApiPropertyOptional({ example: 'regular', enum: ['regular', 'header', 'footer', 'hidden'], default: 'regular' })
  @IsOptional()
  @IsIn(['regular', 'header', 'footer', 'hidden'])
  placement?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}
