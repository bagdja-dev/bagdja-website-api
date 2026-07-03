import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class AcceptInvitationDto {
  @ApiProperty({ description: 'Invitation token received via email' })
  @IsString()
  token: string;
}
