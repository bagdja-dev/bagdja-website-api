import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/** Definisi 1 field form dinamis — diisi seller saat menandai step selesai. */
export class FulfillmentStepFormFieldDto {
  @ApiProperty({ example: 'tracking_number' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  key: string;

  @ApiProperty({ example: 'No Resi' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  label: string;

  @ApiProperty({ enum: ['text', 'number', 'textarea', 'select', 'pdf', 'foto', 'video', 'lokasi'] })
  @IsIn(['text', 'number', 'textarea', 'select', 'pdf', 'foto', 'video', 'lokasi'])
  type: 'text' | 'number' | 'textarea' | 'select' | 'pdf' | 'foto' | 'video' | 'lokasi';

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({ enum: ['seller', 'buyer'], example: 'seller', description: 'Pihak yang harus mengisi field ini' })
  @IsOptional()
  @IsIn(['seller', 'buyer'])
  filled_by?: 'seller' | 'buyer';

  @ApiPropertyOptional({ type: [String], description: "Opsi pilihan — cuma dipakai kalau type='select'" })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];
}
