import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsObject, IsOptional, IsString, Matches, MaxLength, ValidateNested } from 'class-validator';

import { WebsiteThemeDto } from './website-theme.dto';

export class UpdateWebsiteDto {
  @ApiPropertyOptional({ example: 'My New Barber Shop' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ example: 'my-new-barber-shop' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, { message: 'Slug must be lowercase alphanumeric with hyphens' })
  slug?: string;

  @ApiPropertyOptional({ example: 'mynewshop.com' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  domain?: string;

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

  @ApiPropertyOptional({ example: { instagram: 'myshop', facebook: 'myshop' } })
  @IsOptional()
  @IsObject()
  social_links?: Record<string, unknown>;

  @ApiPropertyOptional({ example: { note: 'Senin-Sabtu 09:00-21:00' } })
  @IsOptional()
  @IsObject()
  opening_hours?: Record<string, unknown>;

  @ApiPropertyOptional({ example: { mode: 'dark', accent: 'amber', font: 'system-ui' } })
  @IsOptional()
  @ValidateNested()
  @Type(() => WebsiteThemeDto)
  theme?: WebsiteThemeDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
