import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString } from 'class-validator';

export class CreateInvitationDto {
  @ApiProperty({ example: 'staff@example.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ enum: ['admin', 'editor', 'viewer'], default: 'editor' })
  @IsOptional()
  @IsString()
  @IsIn(['admin', 'editor', 'viewer'])
  role?: string;
}
