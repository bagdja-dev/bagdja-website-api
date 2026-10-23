import { ApiProperty } from '@nestjs/swagger';

export class MyGatheringInvitationResponseDto {
  @ApiProperty({ format: 'uuid', description: 'Registration id, atau invitation id bila kind = INVITATION.' })
  id: string;

  @ApiProperty({ enum: ['INVITATION', 'REGISTRATION'], description: 'INVITATION = undangan INVITE_ONLY yang belum dijawab.' })
  kind: 'INVITATION' | 'REGISTRATION';

  @ApiProperty({ format: 'uuid' })
  group_id: string;

  @ApiProperty({ example: 'Reuni Angkatan 2010' })
  gathering_title: string;

  @ApiProperty({ example: 'GTH-2026-0001' })
  plan_number: string;

  @ApiProperty({ example: 'Budi Santoso' })
  initiator_name: string;

  @ApiProperty({ nullable: true, description: 'Jadwal final; null = belum dijadwalkan.' })
  event_date: Date | null;

  @ApiProperty({ nullable: true, example: 'Bandung' })
  event_location: string | null;

  @ApiProperty({ example: 'CONFIRMED' })
  gathering_status: string;

  @ApiProperty({ nullable: true, example: 'Ayu Lestari' })
  attendee_name: string | null;

  @ApiProperty({ nullable: true, enum: ['RSVP_CONFIRMED', 'CANCELLED'] })
  registration_status: string | null;

  @ApiProperty({ nullable: true, enum: ['UNPAID', 'PENDING_PAYMENT', 'PAID', 'REFUNDED'] })
  payment_status: string | null;

  @ApiProperty({ nullable: true })
  checked_in_at: Date | null;

  @ApiProperty({ description: 'true bila seat atas email login; hanya pemilik seat yang mendapat link tiket QR.' })
  is_attendee: boolean;

  @ApiProperty({ enum: ['RSVP', 'WAITING_INVOICE', 'PAY', 'PAYMENT_PENDING', 'WAITING_CONFIRMATION', 'TICKET', 'ATTENDED', 'NONE'] })
  action: string;

  @ApiProperty({ nullable: true, example: '/gathering/ticket/3q2-Xk…', description: 'Path relatif terhadap base renderer tenant.' })
  action_path: string | null;
}

export class MyGatheringReservationTicketDto {
  @ApiProperty({ example: 'https://toko.sites.bagdja.com/gathering/ticket/3q2-Xk…', description: 'Isi QR tiket (URL halaman tiket).' })
  url: string;

  @ApiProperty({ enum: ['VALID', 'CHECKED_IN'] })
  status: 'VALID' | 'CHECKED_IN';
}

export class MyGatheringReservationResponseDto {
  @ApiProperty({ format: 'uuid', description: 'Registration id.' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  group_id: string;

  @ApiProperty({ example: 'Reuni Angkatan 2010' })
  gathering_title: string;

  @ApiProperty({ example: 'GTH-2026-0001' })
  plan_number: string;

  @ApiProperty({ example: 'Budi Santoso' })
  initiator_name: string;

  @ApiProperty({ nullable: true })
  event_date: Date | null;

  @ApiProperty({ nullable: true, example: 'Bandung' })
  event_location: string | null;

  @ApiProperty({ example: 'CONFIRMED' })
  gathering_status: string;

  @ApiProperty({ type: [String], example: ['Aula Utama'], description: 'Opsi final hasil voting.' })
  final_options: string[];

  @ApiProperty({ nullable: true, example: 'Ayu Lestari' })
  attendee_name: string | null;

  @ApiProperty({ description: 'true bila seat atas email login.' })
  is_attendee: boolean;

  @ApiProperty({ nullable: true, enum: ['RSVP_CONFIRMED', 'CANCELLED'] })
  registration_status: string | null;

  @ApiProperty({ nullable: true, enum: ['UNPAID', 'PENDING_PAYMENT', 'PAID', 'REFUNDED'] })
  payment_status: string | null;

  @ApiProperty({ nullable: true })
  checked_in_at: Date | null;

  @ApiProperty({ enum: ['WAITING_INVOICE', 'PAY', 'PAYMENT_PENDING', 'WAITING_CONFIRMATION', 'TICKET', 'ATTENDED', 'NONE'] })
  action: string;

  @ApiProperty({ example: 150000 })
  price_per_seat: number;

  @ApiProperty({ example: 'IDR' })
  currency: string;

  @ApiProperty({ nullable: true })
  payment_deadline: Date | null;

  @ApiProperty({ nullable: true, example: '/gathering/invoice/0b7d…', description: 'Path halaman tagihan bila sudah terbit.' })
  invoice_path: string | null;

  @ApiProperty({ type: MyGatheringReservationTicketDto, nullable: true, description: 'Hanya untuk pemilik seat lunas pada acara yang sudah dikonfirmasi.' })
  ticket: MyGatheringReservationTicketDto | null;
}
