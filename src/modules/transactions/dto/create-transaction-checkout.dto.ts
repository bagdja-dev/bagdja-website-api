import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  ArrayMinSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/** Alamat pengiriman — disimpan di kolom website_transactions (bukan metadata). */
export class TransactionShippingAddressDto {
  @ApiPropertyOptional({ description: 'Nama penerima' })
  @IsOptional()
  @IsString()
  recipient_name?: string;

  @ApiPropertyOptional({ description: 'No. HP penerima' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: 'Alamat lengkap (jalan, rt/rw, dsb)' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ description: 'Kota/kabupaten' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ description: 'Kecamatan' })
  @IsOptional()
  @IsString()
  district?: string;

  @ApiPropertyOptional({ description: 'Kode pos' })
  @IsOptional()
  @IsString()
  postal_code?: string;
}

/**
 * Checkout dari cart → buat transaction + transaction_items.
 * `order_ids`: id order PENDING milik buyer (item = id order). Semua order
 * harus website & payment_mode sama (1 transaksi = 1 checkout).
 */
export class CreateTransactionCheckoutDto {
  @ApiProperty({
    description: 'Id order (cart line) yang di-checkout — item transaksi',
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID(undefined, { each: true })
  order_ids: string[];

  @ApiPropertyOptional({ description: 'Alamat pengiriman' })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => TransactionShippingAddressDto)
  shipping_address?: TransactionShippingAddressDto;

  @ApiPropertyOptional({ example: 'JNE', description: 'Kurir pengiriman' })
  @IsOptional()
  @IsString()
  courier?: string;
}
