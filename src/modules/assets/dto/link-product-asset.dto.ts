import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';

import type { WebsiteProductAssetRole } from '../../../entities';

export class LinkProductAssetDto {
  @ApiPropertyOptional({ enum: ['download', 'attachment', 'preview'], default: 'download' })
  @IsOptional()
  @IsIn(['download', 'attachment', 'preview'])
  role?: WebsiteProductAssetRole;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sort_order?: number;
}