import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

/** Tagihan Tambahan ad-hoc (fulfillment-praorder-plan.md §2.4.1, Q12) — dibuat kapan saja selama Pascaorder, tidak ikut validasi SUM=100%. */
export class AddAdhocTerminDto {
  @ApiProperty({ description: 'Label Tagihan, mis. "Biaya tambahan bongkar atap"' })
  @IsString()
  label: string;

  @ApiProperty({ description: 'Nominal Tagihan', minimum: 1 })
  @IsNumber()
  @Min(1)
  amount: number;

  @ApiPropertyOptional({
    description: 'Nama step Pascaorder yang digerbangi Tagihan ini (opsional — kosong = murni informasional)',
  })
  @IsOptional()
  @IsString()
  anchor_step_name?: string;
}
