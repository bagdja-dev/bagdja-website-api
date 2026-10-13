import { IsEmail, IsObject, IsOptional, IsString, Length, Matches } from 'class-validator';

export class SubmitGatheringRsvpDto {
  @IsString()
  @Length(1, 255)
  attendee_name: string;

  @IsEmail()
  @Length(3, 320)
  email: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9 ()-]{8,32}$/)
  whatsapp?: string;

  @IsObject()
  selected_options: Record<string, string>;
}
