import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

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
}
