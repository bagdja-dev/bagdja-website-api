import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateLocationDto {
  @ApiProperty({ example: 'Cabang Kemang' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ example: 'branch', enum: ['branch', 'warehouse', 'pickup', 'office'] })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  type?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  is_primary?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_public?: boolean;

  @ApiPropertyOptional({ example: 'Jl. Kemang Raya No. 45' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address_line?: string;

  @ApiPropertyOptional({ example: 'Jakarta Selatan' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ example: 'DKI Jakarta' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  province?: string;

  @ApiPropertyOptional({ example: '12730' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  postal_code?: string;

  @ApiPropertyOptional({
    example: 'Jakarta Selatan, DKI Jakarta',
    description: 'Nama area di bagdja-shipping-service (dari GET /api/public/shipping/areas?q=) — dipakai sebagai asal pengiriman saat hitung ongkir',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  shipping_area_name?: string;

  @ApiPropertyOptional({
    example: ['jne', 'sicepat'],
    description: 'Kode kurir yang aktif untuk lokasi ini (kosongkan untuk pakai semua kurir default shipping-service)',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  active_couriers?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  whatsapp?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  opening_hours?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  maps_url?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  maps_embed?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sort_order?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
