import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateAssetDto {
  @ApiProperty({ example: 'Panduan pengguna v2.pdf', maxLength: 255, required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  @ApiProperty({ example: 'Panduan digital untuk pelanggan.', maxLength: 2000, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ example: 'downloadable', enum: ['downloadable'], required: false })
  @IsOptional()
  @IsIn(['downloadable'])
  asset_type?: string;
}