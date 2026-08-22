import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class CompleteFulfillmentStepDto {
  @ApiProperty({ example: 'SHIPPED', description: 'status_name step di fulfillment flow produk ini' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  step_name: string;

  @ApiPropertyOptional({ example: { tracking_number: 'JX123456789', courier: 'JNE' } })
  @IsOptional()
  @IsObject()
  form_data?: Record<string, unknown>;
}
