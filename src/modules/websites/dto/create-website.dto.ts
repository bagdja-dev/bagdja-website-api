import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateNested } from 'class-validator';

import { SELECTABLE_BUSINESS_PROFILE_IDS, type BusinessProfileId } from '../business-profile.registry';

import { WebsiteThemeDto } from './website-theme.dto';

export class CreateWebsiteDto {
  @ApiProperty({ example: 'My Barber Shop' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: 'my-barber-shop', description: 'URL slug (lowercase, hyphens only)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, { message: 'Slug must be lowercase alphanumeric with hyphens' })
  slug: string;

  @ApiPropertyOptional({ example: 'mybarbershop.com' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  domain?: string;

  @ApiPropertyOptional({ description: 'Template UUID to clone from' })
  @IsOptional()
  @IsUUID()
  template_id?: string;

  @ApiPropertyOptional({ example: 'Premium Barbershop sejak 2020' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  tagline?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/logo.png' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  logo_url?: string;

  @ApiPropertyOptional({ example: '6281234567890' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  whatsapp?: string;

  @ApiPropertyOptional({ example: '+62 812 3456 7890' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional({ example: 'hello@myshop.com' })
  @IsOptional()
  @IsString()
  @MaxLength(320)
  email?: string;

  @ApiPropertyOptional({ example: { mode: 'dark', accent: 'amber' } })
  @IsOptional()
  @ValidateNested()
  @Type(() => WebsiteThemeDto)
  theme?: WebsiteThemeDto;

  @ApiPropertyOptional({
    enum: SELECTABLE_BUSINESS_PROFILE_IDS,
    example: 'online_store',
    description:
      'Jenis bisnis dari wizard Studio. Harus profile berstatus `available` (bukan `legacy`). Tanpa nilai → `legacy` dengan semua modul aktif (perilaku dashboard lama).',
  })
  @IsOptional()
  @IsIn([...SELECTABLE_BUSINESS_PROFILE_IDS])
  business_profile?: BusinessProfileId;
}
