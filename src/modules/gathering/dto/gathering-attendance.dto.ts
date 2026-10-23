import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

export class GatheringCheckInDto {
  @ApiPropertyOptional({
    description: 'Isi QR tiket: URL tiket (…/gathering/ticket/{token}) atau token mentah. Wajib bila registration_id kosong.',
    example: 'https://toko.sites.bagdja.com/gathering/ticket/3q2-Xk…',
  })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  qr?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Check-in manual dari daftar peserta.' })
  @IsOptional()
  @IsUUID()
  registration_id?: string;
}

export class GatheringCheckInRegistrationDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Ayu Lestari' })
  attendee_name: string;

  @ApiProperty({ description: 'Waktu check-in pertama; tidak berubah pada scan ulang.' })
  checked_in_at: Date;

  @ApiProperty({ enum: ['SCAN', 'MANUAL'] })
  check_in_method: 'SCAN' | 'MANUAL';
}

export class GatheringCheckInResponseDto {
  @ApiProperty({ enum: ['CHECKED_IN', 'ALREADY_CHECKED_IN'], description: 'ALREADY_CHECKED_IN = tiket sudah dipakai sebelumnya.' })
  result: 'CHECKED_IN' | 'ALREADY_CHECKED_IN';

  @ApiProperty({ type: GatheringCheckInRegistrationDto })
  registration: GatheringCheckInRegistrationDto;
}

export class GatheringStartResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'IN_PROGRESS' })
  status: string;

  @ApiProperty({ nullable: true })
  started_at: Date | null;
}

export class GatheringTicketOperationResponseDto {
  @ApiProperty({ format: 'uuid' })
  operation_id: string;

  @ApiProperty({ enum: ['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED'], description: 'COMPLETED langsung bila semua tiket sudah pernah terkirim.' })
  status: string;

  @ApiProperty({ example: 3, description: 'Jumlah email tiket yang diantrekan.' })
  total_count: number;
}

export class PublicGatheringTicketResponseDto {
  @ApiProperty({ example: 'Ayu Lestari' })
  attendee_name: string;

  @ApiProperty({ example: 'Reuni Angkatan 2010' })
  gathering_title: string;

  @ApiProperty({ example: 'GTH-2026-0001' })
  plan_number: string;

  @ApiProperty({ nullable: true })
  website_name: string | null;

  @ApiProperty({ nullable: true })
  event_date: Date | null;

  @ApiProperty({ nullable: true })
  event_location: string | null;

  @ApiProperty({ example: 'CONFIRMED' })
  gathering_status: string;

  @ApiProperty({ enum: ['VALID', 'CHECKED_IN', 'INVALID'] })
  ticket_status: 'VALID' | 'CHECKED_IN' | 'INVALID';

  @ApiProperty({ nullable: true })
  checked_in_at: Date | null;

  @ApiProperty({ description: 'URL halaman tiket; nilai ini yang dikodekan di QR.' })
  ticket_url: string;
}
