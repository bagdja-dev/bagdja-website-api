import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsObject, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/** Alamat pengiriman — disimpan ke `order.metadata` (tanpa kolom DB baru). */
export class ShippingAddressDto {
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

export class CreateOrderDto {
  @ApiProperty({ description: 'Website (tenant) tujuan checkout' })
  @IsUUID()
  website_id: string;

  @ApiProperty({ description: 'Produk yang di-checkout (mode ADD_TO_CART/ESCROW)' })
  @IsUUID()
  product_id: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @ApiPropertyOptional({ example: 'midtrans-snap', description: 'Payment provider (wajib saat checkout penuh; opsional utk draft)' })
  @IsOptional()
  @IsString()
  provider?: string;

  @ApiPropertyOptional({ example: 'QRIS', description: 'Payment method (wajib saat checkout penuh; opsional utk draft)' })
  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @ApiPropertyOptional({ description: 'Wallet id bila bayar pakai saldo internal' })
  @IsOptional()
  @IsString()
  selectedWalletId?: string;

  @ApiPropertyOptional({
    description:
      'Order draft (PENDING) yang mau dikonversi jadi checkout penuh — dipakai halaman /checkout setelah + Keranjang',
  })
  @IsOptional()
  @IsUUID()
  order_id?: string;

  @ApiPropertyOptional({ description: 'Alamat pengiriman — disimpan ke order.metadata' })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shipping_address?: ShippingAddressDto;

  @ApiPropertyOptional({ example: 'JNE', description: 'Kurir pengiriman — disimpan ke order.metadata' })
  @IsOptional()
  @IsString()
  courier?: string;
}
