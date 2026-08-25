import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { PaymentMetaEntryDto } from './payment-meta-entry.dto';

export class CreateProductDto {
  @ApiPropertyOptional({ example: 'product', enum: ['product', 'service', 'package', 'digital'] })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  type?: string;

  @ApiPropertyOptional({ example: 'a1b2c3d4-0000-4000-8000-000000000001', description: 'ID kategori dari master website_categories' })
  @IsOptional()
  @IsUUID()
  category_id?: string;

  @ApiPropertyOptional({
    example: 'b1b2c3d4-0000-4000-8000-000000000001',
    description: 'ID produk induk kalau row ini adalah varian (mis. warna/ukuran) — induk harus produk top-level (bukan varian juga)',
  })
  @IsOptional()
  @IsUUID()
  parent_product_id?: string;

  @ApiProperty({ example: 'Pomade Premium' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: 'pomade-premium' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, { message: 'Slug must be lowercase alphanumeric with hyphens' })
  slug: string;

  @ApiPropertyOptional({ example: 'High-hold matte pomade for classic styles' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: '<p>Deskripsi lengkap produk...</p>' })
  @IsOptional()
  @IsString()
  detail?: string;

  @ApiPropertyOptional({ example: 75000, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ type: [String], default: [] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @ApiPropertyOptional({ example: { sku: 'POM-001', duration_minutes: 30, is_bookable: true } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({ type: [PaymentMetaEntryDto], description: 'Daftar cara/link pembayaran checkout, mis. Lynk.id' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentMetaEntryDto)
  payment_meta?: PaymentMetaEntryDto[];

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sort_order?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @ApiPropertyOptional({
    example: 'c1b2c3d4-0000-4000-8000-000000000001',
    description: 'ID fulfillment flow (Order Handling Phase 3) — kosongkan kalau produk ini tidak butuh tracking pengiriman',
  })
  @IsOptional()
  @IsUUID()
  fulfillment_flow_id?: string;

  @ApiPropertyOptional({
    example: 7,
    description:
      'Masa garansi (hari) sejak pesanan siap dikonfirmasi sebelum penjual boleh force-release sisa dana kalau buyer tidak konfirm terima barang — kosongkan kalau force-release tidak diaktifkan untuk produk ini (Order Handling Phase 3 §3.0.2)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  final_release_guaranty_days?: number;

  @ApiPropertyOptional({
    example: 250,
    description: 'Berat produk dalam gram, untuk hitung ongkir — kosongkan kalau tidak tahu (default 250g dipakai saat hitung ongkir)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  weight_grams?: number;

  @ApiPropertyOptional({ example: 30, description: 'Panjang kemasan (cm) — kosongkan untuk default 30cm' })
  @IsOptional()
  @IsInt()
  @Min(1)
  length_cm?: number;

  @ApiPropertyOptional({ example: 30, description: 'Lebar kemasan (cm) — kosongkan untuk default 30cm' })
  @IsOptional()
  @IsInt()
  @Min(1)
  width_cm?: number;

  @ApiPropertyOptional({ example: 5, description: 'Tinggi kemasan (cm) — kosongkan untuk default 5cm' })
  @IsOptional()
  @IsInt()
  @Min(1)
  height_cm?: number;
}
