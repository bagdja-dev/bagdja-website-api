import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';

export class AssignFulfillmentFlowByTypeDto {
  @ApiProperty({ example: 'product', enum: ['product', 'service', 'package', 'digital'] })
  @IsIn(['product', 'service', 'package', 'digital'])
  type: string;

  @ApiPropertyOptional({
    description:
      'ID fulfillment flow untuk diterapkan ke SEMUA produk dengan type ini — kirim null untuk melepas tracking dari semua produk type ini',
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  fulfillment_flow_id?: string | null;
}
