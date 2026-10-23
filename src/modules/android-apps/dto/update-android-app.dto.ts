import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';

import { ANDROID_DISPLAY_MODES, type AndroidDisplayMode } from '../../../entities/website-android-app.entity';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const HEX_COLOR_MESSAGE = 'must be a six-digit hex color such as #0F172A';

export class UpdateAndroidAppDto {
  @ApiProperty({ maxLength: 50 })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  @Matches(/\S/, { message: 'appName must contain at least one non-whitespace character' })
  appName: string;

  @ApiProperty({ maxLength: 255, example: 'com.example.shop' })
  @IsString()
  @Matches(/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/, {
    message: 'packageName must be a valid Android application ID',
  })
  @MaxLength(255)
  packageName: string;

  @ApiPropertyOptional({ maxLength: 64, default: '1.0.0' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @Matches(/\S/, { message: 'versionName must contain at least one non-whitespace character' })
  versionName?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 2100000000, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2100000000)
  versionCode?: number;

  @ApiPropertyOptional({ example: '#7C3AED', description: 'Warna status bar (atas).' })
  @IsOptional()
  @Matches(HEX_COLOR, { message: `primaryColor ${HEX_COLOR_MESSAGE}` })
  primaryColor?: string;

  @ApiPropertyOptional({ example: '#0F172A', description: 'Warna latar splash screen.' })
  @IsOptional()
  @Matches(HEX_COLOR, { message: `splashColor ${HEX_COLOR_MESSAGE}` })
  splashColor?: string;

  @ApiPropertyOptional({ example: '#0F172A', nullable: true, description: 'Warna navigation bar (bawah); null = mengikuti splashColor.' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(HEX_COLOR, { message: `navigationBarColor ${HEX_COLOR_MESSAGE}` })
  navigationBarColor?: string | null;

  @ApiPropertyOptional({ example: '#E5E5E5', nullable: true, description: 'Warna garis pemisah di atas navigation bar; null = tanpa garis.' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(HEX_COLOR, { message: `navigationBarDividerColor ${HEX_COLOR_MESSAGE}` })
  navigationBarDividerColor?: string | null;

  @ApiPropertyOptional({ enum: ANDROID_DISPLAY_MODES, default: 'standalone', description: 'standalone = status & navigation bar terlihat; fullscreen = bar muncul saat diusap; fullscreen-sticky = bar muncul sebentar lalu sembunyi.' })
  @IsOptional()
  @IsIn(ANDROID_DISPLAY_MODES)
  displayMode?: AndroidDisplayMode;
}
