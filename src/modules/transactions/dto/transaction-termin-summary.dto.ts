import { ApiProperty } from '@nestjs/swagger';

/**
 * Ringkasan tagihan 1 transaksi checkout (fulfillment-praorder-plan.md §2.4).
 * Tagihan 1 = DP = transaksi checkout itu sendiri; Tagihan 2..N = baris
 * `website_order_termins` milik order di transaksi ini (CANCELLED tidak
 * dihitung). `null` di response kalau transaksi tidak punya Termin 2..N.
 */
export class TransactionTerminSummaryDto {
  @ApiProperty({ example: 3, description: 'Total tagihan termasuk DP (Tagihan 1), tanpa yang CANCELLED' })
  total: number;

  @ApiProperty({ example: 1, description: 'Tagihan yang sudah lunas — DP (kalau transaksi HELD/COMPLETED/DISPUTED) + Termin PAID' })
  paid: number;

  @ApiProperty({ example: 1, description: 'Termin sudah diterbitkan seller, menunggu dibayar buyer (ISSUED)' })
  issued: number;

  @ApiProperty({ example: 1, description: 'Termin belum diterbitkan seller (SCHEDULED)' })
  scheduled: number;
}
