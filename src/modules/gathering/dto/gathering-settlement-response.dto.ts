import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GatheringReleaseItemResponseDto {
  @ApiProperty({ format: 'uuid', description: 'Transaksi escrow pembayar seat.' })
  transaction_id: string;

  @ApiProperty({ example: 2, description: 'Jumlah seat lunas plan ini di transaksi tersebut.' })
  seat_count: number;

  @ApiProperty({ example: 80000, description: 'Nominal yang dirilis pada pemanggilan ini; 0 bila target sudah tercapai atau gagal.' })
  amount: number;

  @ApiProperty({ enum: ['RELEASED', 'NOTHING_TO_RELEASE', 'FAILED'], example: 'RELEASED' })
  status: 'RELEASED' | 'NOTHING_TO_RELEASE' | 'FAILED';

  @ApiPropertyOptional({ example: 'Escrow must be HELD to release funds (current: DISPUTED)' })
  error?: string;
}

export class GatheringReleaseOutcomeResponseDto {
  @ApiProperty({ enum: ['DEPOSIT', 'FINAL'], example: 'DEPOSIT', description: 'DEPOSIT = DP per seat saat confirm; FINAL = sisa harga seat saat acara selesai.' })
  stage: 'DEPOSIT' | 'FINAL';

  @ApiProperty({ example: 80000, description: 'Total nominal yang dirilis pada pemanggilan ini.' })
  released_total: number;

  @ApiProperty({ example: 0, description: 'Jumlah transaksi yang gagal dirilis dan perlu diulang.' })
  failed_count: number;

  @ApiProperty({ type: [GatheringReleaseItemResponseDto] })
  items: GatheringReleaseItemResponseDto[];
}

export class GatheringCompleteResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'COMPLETED' })
  status: string;

  @ApiProperty({ example: 'COMPLETED' })
  occurrence_status: string;

  @ApiProperty({ type: GatheringReleaseOutcomeResponseDto, description: 'Hasil rilis tahap FINAL.' })
  release: GatheringReleaseOutcomeResponseDto;
}

export class GatheringSettlementTransactionResponseDto {
  @ApiProperty({ format: 'uuid' })
  transaction_id: string;

  @ApiProperty({ example: 'HELD', description: 'Status uang transaksi (mirror status escrow).' })
  transaction_status: string;

  @ApiProperty({ example: 2 })
  seat_count: number;

  @ApiProperty({ type: [String], description: 'Registrasi seat yang dibayar lewat transaksi ini.' })
  registration_ids: string[];

  @ApiProperty({ example: 300000, description: 'Total harga seat plan ini di transaksi tersebut.' })
  seat_total: number;

  @ApiProperty({ example: 80000, description: 'Target DP (deposit_amount_per_seat × seat_count, maksimal seat_total).' })
  deposit_target: number;

  @ApiProperty({ example: 80000, description: 'Total yang sudah dirilis ke seller untuk plan ini.' })
  released_amount: number;
}

export class GatheringSettlementResponseDto {
  @ApiProperty({ enum: ['HOLD', 'DEPOSIT', 'FINAL'], example: 'DEPOSIT', description: 'HOLD = dana masih ditahan penuh (sebelum confirm / dibatalkan).' })
  stage: 'HOLD' | 'DEPOSIT' | 'FINAL';

  @ApiProperty({ example: 300000 })
  seat_total: number;

  @ApiProperty({ example: 80000 })
  deposit_target_total: number;

  @ApiProperty({ example: 80000 })
  released_total: number;

  @ApiProperty({ example: 0, description: 'Selisih target tahap berjalan dengan yang sudah dirilis; > 0 berarti perlu proses ulang.' })
  outstanding_total: number;

  @ApiProperty({ type: [GatheringSettlementTransactionResponseDto] })
  transactions: GatheringSettlementTransactionResponseDto[];
}
