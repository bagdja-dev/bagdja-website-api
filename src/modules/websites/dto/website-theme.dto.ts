import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, Matches, MaxLength, ValidateNested } from 'class-validator';

import {
  BODY_WEIGHTS,
  HEADING_SCALES,
  HEADING_WEIGHTS,
  THEME_ACCENTS,
  THEME_MODES,
  THEME_PRESETS,
} from '../../../common/website-theme';

const HEX_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const FONT_NAMES = [
  'Inter', 'Poppins', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Playfair Display', 'Merriweather',
];

export class ThemeColorsDto {
  @ApiPropertyOptional({ example: '#09090b' })
  @IsOptional()
  @IsString()
  @Matches(HEX_PATTERN, { message: 'Invalid hex color' })
  background?: string;

  @ApiPropertyOptional({ example: '#18181b' })
  @IsOptional()
  @IsString()
  @Matches(HEX_PATTERN)
  surface?: string;

  @ApiPropertyOptional({ example: '#fafafa' })
  @IsOptional()
  @IsString()
  @Matches(HEX_PATTERN)
  text?: string;

  @ApiPropertyOptional({ example: '#a1a1aa' })
  @IsOptional()
  @IsString()
  @Matches(HEX_PATTERN)
  textMuted?: string;

  @ApiPropertyOptional({ example: '#f59e0b' })
  @IsOptional()
  @IsString()
  @Matches(HEX_PATTERN)
  accent?: string;

  @ApiPropertyOptional({ example: '#d97706' })
  @IsOptional()
  @IsString()
  @Matches(HEX_PATTERN)
  accentHover?: string;

  @ApiPropertyOptional({ example: '#27272a' })
  @IsOptional()
  @IsString()
  @Matches(HEX_PATTERN)
  border?: string;

  @ApiPropertyOptional({ example: '#09090b' })
  @IsOptional()
  @IsString()
  @Matches(HEX_PATTERN)
  onAccent?: string;

  @ApiPropertyOptional({ example: '#fafafa', description: 'Warna judul (default: text)' })
  @IsOptional()
  @IsString()
  @Matches(HEX_PATTERN)
  heading?: string;

  @ApiPropertyOptional({ example: '#fbbf24', description: 'Aksen lembut untuk label/eyebrow (default: accent)' })
  @IsOptional()
  @IsString()
  @Matches(HEX_PATTERN)
  accentMuted?: string;

  @ApiPropertyOptional({ example: '#10b981' })
  @IsOptional()
  @IsString()
  @Matches(HEX_PATTERN)
  success?: string;

  @ApiPropertyOptional({ example: '#f59e0b' })
  @IsOptional()
  @IsString()
  @Matches(HEX_PATTERN)
  warning?: string;

  @ApiPropertyOptional({ example: '#ef4444' })
  @IsOptional()
  @IsString()
  @Matches(HEX_PATTERN)
  danger?: string;
}

export class ThemeHeaderColorsDto {
  @ApiPropertyOptional({ example: '#09090b', description: 'Default: colors.background' })
  @IsOptional()
  @IsString()
  @Matches(HEX_PATTERN)
  background?: string;

  @ApiPropertyOptional({ example: '#fafafa', description: 'Default: colors.text' })
  @IsOptional()
  @IsString()
  @Matches(HEX_PATTERN)
  text?: string;

  @ApiPropertyOptional({ example: '#f59e0b', description: 'Garis bawah header. Default: colors.accent' })
  @IsOptional()
  @IsString()
  @Matches(HEX_PATTERN)
  border?: string;
}

export class ThemeFooterColorsDto {
  @ApiPropertyOptional({ example: '#09090b', description: 'Default: colors.background' })
  @IsOptional()
  @IsString()
  @Matches(HEX_PATTERN)
  background?: string;

  @ApiPropertyOptional({ example: '#a1a1aa', description: 'Default: colors.textMuted' })
  @IsOptional()
  @IsString()
  @Matches(HEX_PATTERN)
  text?: string;

  @ApiPropertyOptional({ example: '#f59e0b', description: 'Judul kolom. Default: colors.accentMuted' })
  @IsOptional()
  @IsString()
  @Matches(HEX_PATTERN)
  heading?: string;

  @ApiPropertyOptional({ example: '#a1a1aa', description: 'Default: colors.textMuted' })
  @IsOptional()
  @IsString()
  @Matches(HEX_PATTERN)
  link?: string;

  @ApiPropertyOptional({ example: '#27272a', description: 'Default: colors.border' })
  @IsOptional()
  @IsString()
  @Matches(HEX_PATTERN)
  border?: string;
}

export class ThemeButtonColorsDto {
  @ApiPropertyOptional({ example: '#f59e0b', description: 'Default: colors.accent' })
  @IsOptional()
  @IsString()
  @Matches(HEX_PATTERN)
  primaryBackground?: string;

  @ApiPropertyOptional({ example: '#09090b', description: 'Default: colors.onAccent' })
  @IsOptional()
  @IsString()
  @Matches(HEX_PATTERN)
  primaryText?: string;

  @ApiPropertyOptional({ example: '#fafafa', description: 'Tombol outline. Default: colors.text' })
  @IsOptional()
  @IsString()
  @Matches(HEX_PATTERN)
  secondaryText?: string;

  @ApiPropertyOptional({ example: '#27272a', description: 'Tombol outline. Default: colors.border' })
  @IsOptional()
  @IsString()
  @Matches(HEX_PATTERN)
  secondaryBorder?: string;
}

export class ThemeComponentsDto {
  @ApiPropertyOptional({ type: ThemeHeaderColorsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ThemeHeaderColorsDto)
  header?: ThemeHeaderColorsDto;

  @ApiPropertyOptional({ type: ThemeFooterColorsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ThemeFooterColorsDto)
  footer?: ThemeFooterColorsDto;

  @ApiPropertyOptional({ type: ThemeButtonColorsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ThemeButtonColorsDto)
  button?: ThemeButtonColorsDto;
}

export class ThemeTypographyDto {
  @ApiPropertyOptional({ enum: FONT_NAMES })
  @IsOptional()
  @IsIn(FONT_NAMES)
  headingFont?: string;

  @ApiPropertyOptional({ enum: FONT_NAMES })
  @IsOptional()
  @IsIn(FONT_NAMES)
  bodyFont?: string;

  @ApiPropertyOptional({ enum: HEADING_WEIGHTS })
  @IsOptional()
  @IsIn([...HEADING_WEIGHTS])
  headingWeight?: string;

  @ApiPropertyOptional({ enum: BODY_WEIGHTS })
  @IsOptional()
  @IsIn([...BODY_WEIGHTS])
  bodyWeight?: string;

  @ApiPropertyOptional({ enum: HEADING_SCALES })
  @IsOptional()
  @IsIn([...HEADING_SCALES])
  headingScale?: string;
}

export class WebsiteThemeDto {
  @ApiPropertyOptional({ enum: THEME_MODES })
  @IsOptional()
  @IsIn([...THEME_MODES])
  mode?: string;

  @ApiPropertyOptional({ enum: THEME_ACCENTS })
  @IsOptional()
  @IsIn([...THEME_ACCENTS])
  accent?: string;

  @ApiPropertyOptional({ enum: THEME_PRESETS })
  @IsOptional()
  @IsIn([...THEME_PRESETS])
  preset?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  font?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => ThemeColorsDto)
  colors?: ThemeColorsDto;

  @ApiPropertyOptional({ type: ThemeComponentsDto, description: 'Override warna per komponen; kosong = ikut token global' })
  @IsOptional()
  @ValidateNested()
  @Type(() => ThemeComponentsDto)
  components?: ThemeComponentsDto;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => ThemeTypographyDto)
  typography?: ThemeTypographyDto;
}
