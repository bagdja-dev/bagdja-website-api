import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn, IsString, MaxLength } from 'class-validator';

export class CreatePlatformInvitationDto {
  @ApiProperty({ maxLength: 320 })
  @IsEmail()
  @MaxLength(320)
  email: string;

  @ApiProperty({ enum: ['designer', 'reviewer'] })
  @IsString()
  @IsIn(['designer', 'reviewer'])
  role: 'designer' | 'reviewer';
}

