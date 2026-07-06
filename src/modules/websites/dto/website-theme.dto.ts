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

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => ThemeTypographyDto)
  typography?: ThemeTypographyDto;
}
