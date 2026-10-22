import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateAndroidBuildDto {
  @ApiProperty({ enum: ['debug', 'release'], default: 'debug' })
  @IsIn(['debug', 'release'])
  buildType: 'debug' | 'release';

  @ApiProperty({ enum: ['apk', 'aab'] })
  @IsIn(['apk', 'aab'])
  outputFormat: 'apk' | 'aab';

  @ApiPropertyOptional({ maxLength: 64 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  versionName?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 2100000000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2100000000)
  versionCode?: number;
}
