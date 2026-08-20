import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

/** Daftar `payment_mode` yang didukung Website Builder. */
export const PAYMENT_MODES = ['LYNK', 'ADD_TO_CART', 'ESCROW'] as const;

export class PaymentMetaEntryDto {
  @ApiProperty({ enum: PAYMENT_MODES, example: 'LYNK' })
  @IsIn(PAYMENT_MODES)
  payment_mode: string;

  @ApiPropertyOptional({ example: 'https://lynk.id/namatoko/produk-a' })
  @IsOptional()
  @IsString()
  payment_link?: string;
}
