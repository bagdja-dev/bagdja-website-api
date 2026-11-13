import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateGatheringInvitationContentDto {
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  invitation_banner_url?: string | null;

  /** HTML ringan dari editor (disanitasi profil `basic` saat disimpan); teks polos lama tetap diterima. */
  @ApiPropertyOptional({ nullable: true, maxLength: 5000, description: 'Teks undangan — HTML ringan (p, br, strong, em, u, s, ul, ol, li, a) atau teks polos.' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  invitation_description?: string | null;
}