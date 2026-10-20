import { IsEmail, IsObject, IsOptional, IsString, Length, Matches } from 'class-validator';

/**
 * RSVP undangan privat (INVITE_ONLY). Identitas peserta diambil dari data
 * undangan dan akun yang login, bukan dari body request.
 */
export class SubmitPrivateGatheringRsvpDto {
  /** Hanya dipakai bila undangan tidak menyimpan nama penerima. */
  @IsOptional()
  @IsString()
  @Length(1, 255)
  attendee_name?: string;

  /** Diabaikan; dipertahankan supaya klien lama tidak ditolak `forbidNonWhitelisted`. */
  @IsOptional()
  @IsEmail()
  @Length(3, 320)
  email?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9 ()-]{8,32}$/)
  whatsapp?: string;

  @IsObject()
  selected_options: Record<string, string>;
}
