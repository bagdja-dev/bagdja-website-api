import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { FulfillmentStepFormFieldDto } from './fulfillment-step-form-field.dto';

export class FulfillmentFlowStepInputDto {
  @ApiProperty({ example: 1, description: 'Urutan step — buyer/seller harus melewatinya berurutan' })
  @IsInt()
  @Min(1)
  sequence: number;

  @ApiProperty({ example: 'SHIPPED' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  status_name: string;

  @ApiPropertyOptional({ example: 'Produk sudah dikirim ke ekspedisi' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 3, description: 'Estimasi hari — informasi saja, bukan deadline keras' })
  @IsOptional()
  @IsInt()
  @Min(1)
  process_day?: number;

  @ApiPropertyOptional({ type: [FulfillmentStepFormFieldDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FulfillmentStepFormFieldDto)
  form_schema?: FulfillmentStepFormFieldDto[];

  @ApiPropertyOptional({
    example: 50,
    description: '% dari total amount GRUP yang boleh dirilis begitu step ini disetujui (Order Handling Phase 3 §3.0.1)',
  })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Max(100)
  release_percentage?: number;

  @ApiPropertyOptional({
    example: 7,
    description: 'Batas hari buyer approve sebelum seller boleh force-release sendiri — cuma relevan kalau release_percentage diisi',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  guaranty_days?: number;
}
