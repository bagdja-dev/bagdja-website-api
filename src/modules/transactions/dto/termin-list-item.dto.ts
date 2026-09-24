import { ApiProperty } from '@nestjs/swagger';

import type { WebsiteOrderTerminStatus } from '../../../entities';

/** 1 baris Termin di halaman "Invoice" lintas-order (seller & buyer). */
export class TerminListItemDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ description: '2, 3, ... — Termin 1 (DP) tidak pernah jadi baris di sini' })
  sequence: number;

  @ApiProperty()
  label: string;

  @ApiProperty()
  amount: number;

  @ApiProperty({ enum: ['SCHEDULED', 'ISSUED', 'PAID', 'CANCELLED'] })
  status: WebsiteOrderTerminStatus;

  @ApiProperty({ nullable: true, description: 'Step Pascaorder tempat Termin ini disisipkan di timeline' })
  anchorStepName: string | null;

  @ApiProperty({ format: 'uuid', description: 'ID order (website_orders) asal Termin ini' })
  orderId: string;

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    description:
      'ID transaksi ASLI yang berisi order ini (dipakai untuk link "Lihat Order" — beda dari transactionId di bawah)',
  })
  orderTransactionId: string | null;

  @ApiProperty({ nullable: true })
  productName: string | null;

  @ApiProperty({
    nullable: true,
    description: 'Identifier buyer (email/username saat checkout) — hanya diisi untuk response seller',
  })
  buyerIdentifier: string | null;

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    description: 'Terisi begitu Termin ini sendiri sudah dibayar (transaksi direct-pay Termin, bukan transaksi order asal)',
  })
  transactionId: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  issuedAt: Date | null;
}

export class TerminListMetaDto {
  @ApiProperty()
  page: number;

  @ApiProperty()
  size: number;

  @ApiProperty()
  total: number;

  @ApiProperty()
  totalPages: number;
}

export class TerminListResponseDto {
  @ApiProperty({ type: [TerminListItemDto] })
  data: TerminListItemDto[];

  @ApiProperty({ type: TerminListMetaDto })
  meta: TerminListMetaDto;
}

export class TerminCountResponseDto {
  @ApiProperty()
  count: number;
}
