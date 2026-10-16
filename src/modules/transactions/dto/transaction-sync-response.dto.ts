import { ApiProperty } from '@nestjs/swagger';

export const TRANSACTION_SYNC_STEPS = ['escrow', 'direct_payment', 'termin', 'digital_delivery'] as const;
export type TransactionSyncStep = (typeof TRANSACTION_SYNC_STEPS)[number];

/** Hasil `POST /api/transactions/:id/sync` — sinkron status best-effort, tidak pernah memblokir detail transaksi. */
export class TransactionSyncResponseDto {
  @ApiProperty({ format: 'uuid', description: 'ID transaksi yang disinkronkan' })
  id: string;

  @ApiProperty({
    description: 'Status transaksi setelah sinkron (status terakhir di DB kalau sinkron gagal)',
    example: 'COMPLETED',
  })
  status: string;

  @ApiProperty({ description: 'true kalau semua langkah sinkron yang relevan berhasil' })
  synced: boolean;

  @ApiProperty({
    enum: TRANSACTION_SYNC_STEPS,
    isArray: true,
    description: 'Langkah sinkron yang gagal (detail error ada di log API). Kosong kalau semua berhasil.',
    example: [],
  })
  sync_errors: TransactionSyncStep[];
}
