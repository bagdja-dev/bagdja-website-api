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
 * Pilihan ongkir buyer saat checkout — HANYA berisi PILIHAN (lokasi asal,
 * tujuan, kurir), BUKAN nominal cost. `TransactionsService.createCheckout()`
 * memanggil ulang `ShippingCalculationService` server-side untuk dapat cost
 * otoritatif dari pilihan ini — nilai cost dari client TIDAK pernah dipercaya
 * langsung (lihat plan Fase 3B, mencegah manipulasi harga ongkir dari client).
 */
export class CheckoutShippingSelectionDto {
  @ApiProperty({ description: 'Id lokasi (website_locations) asal pengiriman yang dipilih buyer' })
  @IsUUID()
  location_id: string;

  @ApiProperty({ description: 'providerAreaId tujuan (hasil GET /api/public/shipping/areas?q=...)' })
  @IsString()
  destination_area_id: string;

  @ApiPropertyOptional({ description: 'Nama area tujuan untuk ditampilkan (label hasil search, bukan sumber kebenaran)' })
  @IsOptional()
  @IsString()
  destination_area_name?: string;

  @ApiProperty({ example: 'jne', description: 'Kode kurir yang dipilih buyer dari hasil cek ongkir' })
  @IsString()
  courier_code: string;

  @ApiPropertyOptional({ example: 'REG', description: 'Nama layanan kurir (untuk ditampilkan)' })
  @IsOptional()
  @IsString()
  courier_service_name?: string;
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

  @ApiPropertyOptional({ example: 'JNE', description: 'Kurir pengiriman (flow lama, dipakai kalau website belum punya lokasi shippable — lihat shipping)' })
  @IsOptional()
  @IsString()
  courier?: string;

  @ApiPropertyOptional({ description: 'Pilihan ongkir hasil cek real-time (flow baru — lihat CheckoutShippingSelectionDto)' })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => CheckoutShippingSelectionDto)
  shipping?: CheckoutShippingSelectionDto;
}
