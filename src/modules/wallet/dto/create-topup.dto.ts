import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, Min } from 'class-validator';

export class CreateTopupDto {
  @ApiProperty({
    example: 50000,
    description:
      'Jumlah topup dalam unit terkecil currency (IDR = rupiah, bukan sen). Minimum 10000.',
  })
  @IsNumber()
  @Min(10000)
  amount: number;

  @ApiProperty({ example: 'IDR', required: false, default: 'IDR' })
  @IsOptional()
  @IsIn(['IDR'])
  currency?: string;
}
