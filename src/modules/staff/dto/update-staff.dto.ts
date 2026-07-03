import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateStaffDto {
  @ApiPropertyOptional({ enum: ['admin', 'editor', 'viewer'] })
  @IsOptional()
  @IsString()
  @IsIn(['admin', 'editor', 'viewer'])
  role?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
