import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * 1 baris Termin (fulfillment-praorder-plan.md §2.3) — sequence-nya
 * ditentukan dari posisi di array (index 0 = Termin 1/DP), BUKAN dikirim
 * client. Termin 1 tidak jadi baris `website_order_termins` (langsung jadi
 * `total_amount` order), Termin 2..N yang jadi baris.
 */
export class TerminInputDto {
  @ApiProperty({ description: 'Label Termin, mis. "DP", "Pelunasan"' })
  @IsString()
  label: string;

  @ApiProperty({ description: 'Nominal Termin ini', minimum: 1 })
  @IsNumber()
  @Min(1)
  amount: number;

  @ApiPropertyOptional({
    description:
      'Nama step Pascaorder tempat Termin ini (kalau bukan Termin 1) disisipkan di timeline — kosongkan kalau tidak perlu terikat progres manapun',
  })
  @IsOptional()
  @IsString()
  anchor_step_name?: string;
}

export class SetOrderQuoteDto {
  @ApiProperty({ description: 'Harga final hasil quotation dalam mata uang order', minimum: 1 })
  @IsNumber()
  @Min(1)
  final_price: number;

  @ApiPropertyOptional({
    description:
      'Opsi "Atur Termin" (§2.3) — kalau diisi, SUM(amount) harus persis sama dengan final_price. Minimal 2 baris (Termin 1 + minimal 1 Termin lanjutan), kalau tidak diisi berarti 1 kali bayar penuh seperti biasa.',
    type: [TerminInputDto],
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => TerminInputDto)
  termins?: TerminInputDto[];
}