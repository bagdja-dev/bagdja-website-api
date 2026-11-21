import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

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

  @ApiProperty({
    enum: ['text', 'number', 'textarea', 'select', 'tanggal', 'tanggal_waktu', 'pdf', 'archive', 'foto', 'video', 'lokasi'],
    description:
      '`tanggal` = tanggal saja, nilai `YYYY-MM-DD`. `tanggal_waktu` = tanggal & jam lokal bisnis, nilai `YYYY-MM-DDTHH:mm`.',
  })
  @IsIn(['text', 'number', 'textarea', 'select', 'tanggal', 'tanggal_waktu', 'pdf', 'archive', 'foto', 'video', 'lokasi'])
  type: 'text' | 'number' | 'textarea' | 'select' | 'tanggal' | 'tanggal_waktu' | 'pdf' | 'archive' | 'foto' | 'video' | 'lokasi';

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

  @ApiPropertyOptional({ example: 5, minimum: 1, maximum: 20, description: 'Maksimal file untuk field foto/video/PDF/arsip; default 5' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  max_files?: number;

  @ApiPropertyOptional({
    enum: ['start', 'end'],
    description:
      'Hanya untuk type tanggal/tanggal_waktu: jadikan jadwal pesanan di kalender (start = mulai, end = selesai). ' +
      'Diabaikan untuk tipe lain.',
  })
  @IsOptional()
  @IsIn(['start', 'end'])
  calendar_role?: 'start' | 'end';
}
