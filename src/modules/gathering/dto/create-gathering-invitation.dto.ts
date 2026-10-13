import { IsEmail, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class CreateGatheringInvitationDto {
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

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  expires_in_days?: number;
}