import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsUUID } from 'class-validator';

/** Rentang kalender jasa — pembeli (lintas website / satu website) & penjual. */
export class ServiceScheduleQueryDto {
  @ApiProperty({ description: 'Awal rentang (ISO 8601, inklusif).', example: '2026-11-01T00:00:00+07:00' })
  @IsISO8601()
  from: string;

  @ApiProperty({ description: 'Akhir rentang (ISO 8601, eksklusif). Maksimal 400 hari dari `from`.', example: '2026-12-01T00:00:00+07:00' })
  @IsISO8601()
  to: string;

  @ApiPropertyOptional({ description: 'Pembeli saja: batasi ke satu website (renderer tenant).' })
  @IsOptional()
  @IsUUID()
  website_id?: string;
}

/**
 * Tahap jasa di kalender:
 * - `planning` — praorder: quotation belum ada / langkah praorder belum lengkap;
 * - `payment` — quotation siap, menunggu pembayaran (belum checkout / transaksi belum dibayar);
 * - `confirmed` — sudah dibayar (DP = termin 1), jasa berjalan;
 * - `completed` — transaksi selesai dan semua termin lunas.
 * Pesanan batal/refund/kedaluwarsa tidak dikembalikan.
 */
export type ServiceScheduleStatus = 'planning' | 'payment' | 'confirmed' | 'completed';

export class ServiceScheduleItemDto {
  @ApiProperty({ format: 'uuid' })
  order_id: string;

  @ApiProperty({ format: 'uuid', nullable: true, description: 'null = belum checkout (masih di keranjang).' })
  transaction_id: string | null;

  @ApiProperty({ format: 'uuid' })
  website_id: string;

  @ApiProperty({ format: 'uuid' })
  product_id: string;

  @ApiProperty({ example: 'Foto prewedding outdoor' })
  product_name: string;

  @ApiProperty({ nullable: true, description: 'Gambar pertama produk.' })
  product_image: string | null;

  @ApiProperty({ example: 1 })
  quantity: number;

  @ApiProperty({ enum: ['planning', 'payment', 'confirmed', 'completed'] })
  status: ServiceScheduleStatus;

  @ApiProperty({ nullable: true, example: 'HELD', description: 'Status transaksi (null = belum checkout).' })
  transaction_status: string | null;

  @ApiProperty({ format: 'date-time', nullable: true, example: '2026-11-20T02:00:00.000Z', description: 'null = belum dijadwalkan.' })
  start_at: string | null;

  @ApiProperty({ format: 'date-time', nullable: true })
  end_at: string | null;

  @ApiProperty({ description: 'true = jadwal dari field tanggal (sepanjang hari, tanpa jam).' })
  all_day: boolean;

  @ApiProperty({ nullable: true, description: 'Identitas pembeli (hanya terisi di kalender penjual).' })
  buyer_identifier: string | null;
}
