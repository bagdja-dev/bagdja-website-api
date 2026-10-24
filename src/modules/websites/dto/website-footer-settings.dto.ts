import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class WebsiteFooterSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  show_logo?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  show_business_name?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  show_tagline?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  show_social_links?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  show_pages?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  show_address?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  show_whatsapp?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  show_phone?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  show_email?: boolean;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  contact_heading?: string;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  pages_heading?: string;

  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  copyright_text?: string;
}
