import { IsString, Matches, IsUUID } from 'class-validator';

export class VerifyGatheringRsvpOtpDto {
  @IsUUID('4')
  reservation_id: string;

  @IsString()
  @Matches(/^\d{6}$/)
  code: string;
}