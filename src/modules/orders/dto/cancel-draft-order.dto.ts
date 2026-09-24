import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CancelDraftOrderDto {
  @ApiPropertyOptional({ description: 'Alasan pembatalan oleh seller (opsional, default "Dibatalkan oleh penjual")' })
  @IsOptional()
  @IsString()
  reason?: string;
}
