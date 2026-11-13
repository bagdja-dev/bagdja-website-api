import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Thread chat website untuk Inbox Studio & halaman chat pembeli. */
export class WebsiteChatThreadResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  website_id: string;

  @ApiProperty({ format: 'uuid', description: 'Pemilik website (penerima chat pembeli).' })
  merchant_id: string;

  @ApiProperty({ enum: ['support', 'product', 'order', 'transaction'], example: 'order' })
  channel_type: string;

  @ApiPropertyOptional({ nullable: true, example: 'Rencana KMPL-GTR-13-11-2026-001' })
  channel_label: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  product_id: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Order terkait (mis. order rencana gathering).' })
  order_id: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  transaction_id: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Kelompok gathering dari metadata order — Studio membuka /studio/orders/gathering/:id.',
  })
  gathering_group_id: string | null;

  @ApiProperty({ format: 'uuid' })
  customer_user_id: string;

  @ApiProperty({ example: 'Dewi Anggraini' })
  customer_name: string;

  @ApiPropertyOptional({ nullable: true })
  customer_email: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'Halo, saya ingin berdiskusi…' })
  last_message_preview: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' })
  last_message_at: Date | null;

  @ApiProperty({ example: 'open' })
  status: string;
}
