import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class GetShippingCostDto {
  @ApiProperty({
    description: 'Id order (cart line) yang mau dihitung ongkirnya — berat digabung dari semua item ini',
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID(undefined, { each: true })
  order_ids: string[];

  @ApiProperty({
    description: 'Id lokasi (website_locations) yang jadi asal pengiriman — buyer pilih dari daftar lokasi shippable',
  })
  @IsUUID()
  location_id: string;

  @ApiProperty({
    description: 'providerAreaId tujuan (hasil GET /api/public/shipping/areas?q=...)',
  })
  @IsString()
  destination_area_id: string;

  @ApiPropertyOptional({ example: 'jne', description: 'Filter kurir tertentu (opsional)' })
  @IsOptional()
  @IsString()
  courier_code?: string;
}
