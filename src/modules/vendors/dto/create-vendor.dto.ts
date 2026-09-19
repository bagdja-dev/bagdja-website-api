import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateVendorDto {
  @ApiProperty({ example: 'Bengkel Karya Jaya' })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ example: '628123456789', description: 'Nomor WhatsApp kontak utama vendor' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  contact_whatsapp?: string;

  @ApiPropertyOptional({ example: 'Vendor prioritas untuk area Jakarta Selatan' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ enum: ['active', 'inactive'], default: 'active' })
  @IsOptional()
  @IsEnum(['active', 'inactive'])
  status?: 'active' | 'inactive';

  @ApiPropertyOptional({
    type: [String],
    example: ['loc-uuid-1', 'loc-uuid-2'],
    description: 'Lokasi yang dilayani vendor. Kosongkan untuk tidak menetapkan lokasi.',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  location_ids?: string[];
}
