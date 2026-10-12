import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GatheringPlanOccurrenceResponseDto {
  @ApiProperty({ format: 'uuid', example: '6f1c1f3e-8a1d-4c55-9f0b-2b7d4f6a9c11' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  website_id: string;

  @ApiProperty({ format: 'uuid' })
  product_id: string;

  @ApiProperty({ format: 'uuid', description: 'ID group parent (website_event_groups.id).' })
  parent_order_id: string;

  @ApiProperty({ format: 'uuid' })
  initiator_user_id: string;

  @ApiProperty({ example: 'Rencana Paket Bukber' })
  title: string;

  @ApiProperty({ enum: ['DRAFT', 'PREORDER', 'RSVP_OPEN', 'PAYMENT_OPEN', 'CONFIRMED', 'COMPLETED', 'CANCELLED'], example: 'PREORDER' })
  status: string;

  @ApiProperty({ example: 150000, description: 'Harga tetap per seat, snapshot dari produk saat plan dibuat.' })
  price_per_seat: number;

  @ApiProperty({ example: 'IDR' })
  currency: string;

  @ApiProperty({ example: 10 })
  min_attendees: number;

  @ApiProperty({ example: 40 })
  max_attendees: number;

  @ApiPropertyOptional({ nullable: true, example: null, description: 'Jadwal final; null selama praorder.' })
  final_schedule?: string | null;

  @ApiPropertyOptional({ nullable: true, example: null, description: 'Lokasi final; null selama praorder.' })
  final_location?: string | null;

  @ApiProperty({ type: 'object', additionalProperties: true, description: 'Snapshot kebijakan pembatalan seluruh event dari produk.' })
  cancellation_policy_snapshot: Record<string, unknown>;

  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true }, description: 'Snapshot option choices aktif produk saat plan dibuat.' })
  option_groups_snapshot: Record<string, unknown>[];
}

export class GatheringPlanResponseDto {
  @ApiProperty({ format: 'uuid', description: 'ID group parent (website_event_groups.id), dipakai untuk lookup occurrence dan status gathering.' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  website_id: string;

  @ApiProperty({ format: 'uuid' })
  product_id: string;

  @ApiProperty({ format: 'uuid' })
  initiator_user_id: string;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Order rencana di cart initiator (website_orders PENDING, quantity 0, tidak pernah di-checkout); detail dibuka melalui /cart/order/{order_id}. Null untuk plan lama sebelum gathering masuk cart.',
  })
  order_id: string | null;

  @ApiProperty({ example: 'Rencana Paket Bukber' })
  title: string;

  @ApiProperty({ example: 'PREORDER' })
  status: string;

  @ApiProperty({ enum: ['OPEN', 'INVITE_ONLY'], example: 'OPEN' })
  invite_policy: 'OPEN' | 'INVITE_ONLY';

  @ApiProperty({ type: GatheringPlanOccurrenceResponseDto })
  occurrence: GatheringPlanOccurrenceResponseDto;

  @ApiProperty({ type: String, format: 'date-time' })
  created_at: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updated_at: Date;
}
