import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { FulfillmentFlowStepInputDto } from './fulfillment-flow-step-input.dto';

export class CreateFulfillmentFlowDto {
  @ApiProperty({ example: 'Standard Shipping' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ example: 'SOP pengiriman standar untuk produk fisik' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @ApiProperty({ type: [FulfillmentFlowStepInputDto], description: 'Minimal 1 step. Total release_percentage seluruh step maksimal 100%.' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => FulfillmentFlowStepInputDto)
  steps: FulfillmentFlowStepInputDto[];
}
