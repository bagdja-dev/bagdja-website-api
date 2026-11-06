import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TenantGatheringListPayloadDto {
  @ApiProperty()
  group_id: string;

  @ApiProperty()
  occurrence_id: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ enum: ['DRAFT', 'PREORDER', 'RSVP_OPEN', 'PAYMENT_OPEN', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] })
  status: string;

  @ApiProperty({ nullable: true })
  final_schedule: string | null;

  @ApiProperty({ nullable: true })
  final_location: string | null;

  @ApiProperty()
  min_attendees: number;

  @ApiProperty()
  max_attendees: number;

  @ApiProperty({ description: 'Number of confirmed participants whose registration is paid.' })
  paid_count: number;

  @ApiProperty({ description: 'Number of confirmed participant registrations.' })
  registered_count: number;

  @ApiProperty({ description: 'Total amount paid by participants, in the gathering currency.' })
  collected_amount: number;

  @ApiProperty()
  currency: string;

  @ApiProperty({ nullable: true })
  initiator_name: string | null;
}

export class TenantTransactionListItemDto {
  @ApiProperty({ description: 'For gathering rows this is the gathering group ID.' })
  id: string;

  @ApiProperty({ enum: ['order', 'gathering'] })
  kind: 'order' | 'gathering';

  @ApiPropertyOptional()
  website_id?: string;

  @ApiPropertyOptional({ nullable: true })
  buyer_user_id?: string | null;

  @ApiPropertyOptional({ nullable: true })
  buyer_identifier?: string | null;

  @ApiPropertyOptional({ nullable: true })
  recipient_name?: string | null;

  @ApiPropertyOptional({ nullable: true })
  phone?: string | null;

  @ApiPropertyOptional({ nullable: true })
  address?: string | null;

  @ApiPropertyOptional({ nullable: true })
  city?: string | null;

  @ApiPropertyOptional({ nullable: true })
  district?: string | null;

  @ApiPropertyOptional({ nullable: true })
  postal_code?: string | null;

  @ApiPropertyOptional({ nullable: true })
  courier?: string | null;

  @ApiPropertyOptional({ nullable: true })
  shipping_cost?: number | null;

  @ApiProperty()
  created_at: string;

  @ApiProperty()
  currency: string;

  @ApiProperty({
    description:
      'Order payment status, or the effective payment status aggregated over a gathering group.',
  })
  status: string;

  @ApiProperty()
  total_amount: number;

  @ApiPropertyOptional()
  payment_mode?: string | null;

  @ApiPropertyOptional()
  fulfillment_status?: string;

  @ApiPropertyOptional({ nullable: true })
  ref_number?: string | null;

  @ApiPropertyOptional({ nullable: true })
  checkout_url?: string | null;

  @ApiPropertyOptional({ nullable: true })
  payment_request_id?: string | null;

  @ApiPropertyOptional({ nullable: true })
  escrow_id?: string | null;

  @ApiPropertyOptional({ nullable: true })
  held_at?: string | null;

  @ApiPropertyOptional()
  updated_at?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true, nullable: true })
  metadata?: Record<string, unknown> | null;

  @ApiProperty()
  needs_action: boolean;

  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true } })
  items: Record<string, unknown>[];

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  fulfillment?: Record<string, unknown>;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true, nullable: true })
  termin_summary?: Record<string, unknown> | null;

  @ApiPropertyOptional({ type: TenantGatheringListPayloadDto })
  gathering?: TenantGatheringListPayloadDto;
}

export class TenantTransactionListMetaDto {
  @ApiProperty()
  page: number;

  @ApiProperty()
  size: number;

  @ApiProperty()
  total: number;

  @ApiProperty()
  totalPages: number;
}

export class TenantTransactionListResponseDto {
  @ApiProperty({ type: [TenantTransactionListItemDto] })
  data: TenantTransactionListItemDto[];

  @ApiProperty({ type: TenantTransactionListMetaDto })
  meta: TenantTransactionListMetaDto;
}

export class TenantTransactionSummaryCountsDto {
  @ApiProperty()
  all: number;

  @ApiProperty()
  needsAction: number;

  @ApiProperty()
  awaitingPayment: number;

  @ApiProperty()
  processing: number;

  @ApiProperty()
  completed: number;

  @ApiProperty()
  cancelled: number;
}

export class TenantTransactionSummaryAmountDto {
  @ApiProperty()
  currency: string;

  @ApiProperty()
  amount: number;
}

export class TenantTransactionSummaryDto {
  @ApiProperty({ type: TenantTransactionSummaryCountsDto })
  counts: TenantTransactionSummaryCountsDto;

  @ApiProperty({ type: [TenantTransactionSummaryAmountDto] })
  heldAmounts: TenantTransactionSummaryAmountDto[];

  @ApiProperty({ type: [TenantTransactionSummaryAmountDto] })
  releasedThisMonth: TenantTransactionSummaryAmountDto[];

  @ApiProperty()
  releasedThisMonthCount: number;
}
