import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
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

export class UpdateProductDto {
  @ApiPropertyOptional({ example: 'service', enum: ['product', 'service', 'package', 'digital'] })
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
    description: 'ID produk induk kalau row ini adalah varian — induk harus produk top-level (bukan varian juga)',
  })
  @IsOptional()
  @IsUUID()
  parent_product_id?: string;

  @ApiPropertyOptional({ example: 'Pomade Deluxe' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ example: 'pomade-deluxe' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, { message: 'Slug must be lowercase alphanumeric with hyphens' })
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  detail?: string;

  @ApiPropertyOptional({ example: 85000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({ type: [PaymentMetaEntryDto], description: 'Daftar cara/link pembayaran checkout, mis. Lynk.id' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentMetaEntryDto)
  payment_meta?: PaymentMetaEntryDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  sort_order?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @ApiPropertyOptional({
    description: 'ID fulfillment flow (Order Handling Phase 3) — kirim null untuk lepas tracking dari produk ini',
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  fulfillment_flow_id?: string | null;

  @ApiPropertyOptional({
    description:
      'Masa garansi (hari) sejak pesanan siap dikonfirmasi sebelum penjual boleh force-release sisa dana kalau buyer tidak konfirm terima barang — kirim null untuk menonaktifkan force-release (Order Handling Phase 3 §3.0.2)',
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  final_release_guaranty_days?: number | null;
}
