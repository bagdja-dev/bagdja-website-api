import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

export class TrackAnalyticsEventDto {
  @ApiProperty({ enum: ['page_view', 'cta_click'] })
  @IsIn(['page_view', 'cta_click'])
  event_type: 'page_view' | 'cta_click';

  @ApiProperty({ format: 'uuid', description: 'Short-lived first-party session identifier; never stored directly.' })
  @IsUUID('4')
  visitor_id: string;

  @ApiProperty({ example: '/produk/kopi' })
  @IsString()
  @MaxLength(500)
  @Matches(/^\/[^?#]*$/)
  page_path: string;

  @ApiPropertyOptional({ example: 'instagram' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Matches(/^[a-zA-Z0-9._ -]*$/)
  source?: string;

  @ApiPropertyOptional({ example: 'Pesan via WhatsApp' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(/^[\p{L}\p{N} ._+-]*$/u)
  label?: string;
}
