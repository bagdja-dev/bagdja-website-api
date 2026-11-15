import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsUUID } from 'class-validator';

/** Rentang kalender jasa terjadwal — pembeli (lintas website / satu website) & penjual. */
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
 * Status jadwal di kalender:
 * - `proposed` — pesanan belum dibayar (masih di keranjang / menunggu pembayaran);
 * - `scheduled` — sudah dibayar (dana di escrow / berjalan);
 * - `done` — pesanan selesai.
 * Pesanan batal/refund tidak dikembalikan.
 */
export type ServiceScheduleStatus = 'proposed' | 'scheduled' | 'done';

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

  @ApiProperty({ enum: ['proposed', 'scheduled', 'done'] })
  status: ServiceScheduleStatus;

  @ApiProperty({ example: 'HELD', description: 'Status mentah website_orders.status.' })
  order_status: string;

  @ApiProperty({ format: 'date-time', example: '2026-11-20T02:00:00.000Z' })
  start_at: string;

  @ApiProperty({ format: 'date-time', nullable: true })
  end_at: string | null;

  @ApiProperty({ description: 'true = jadwal dari field tanggal (sepanjang hari, tanpa jam).' })
  all_day: boolean;

  @ApiProperty({ nullable: true, description: 'Identitas pembeli (hanya terisi di kalender penjual).' })
  buyer_identifier: string | null;
}
