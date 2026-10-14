import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateGatheringInvitationContentDto {
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  invitation_banner_url?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  invitation_description?: string | null;
}