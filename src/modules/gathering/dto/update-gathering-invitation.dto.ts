import { IsEmail, IsOptional, IsString, Length } from 'class-validator';

export class UpdateGatheringInvitationDto {
  @IsOptional()
  @IsString()
  @Length(1, 255)
  invitee_name?: string;

  @IsOptional()
  @IsEmail()
  @Length(3, 320)
  email?: string;

  @IsOptional()
  @IsString()
  @Length(8, 32)
  whatsapp?: string;
}
