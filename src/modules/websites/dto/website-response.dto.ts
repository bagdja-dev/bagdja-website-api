import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WebsiteResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  org_id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  slug: string;

  @ApiPropertyOptional()
  domain?: string | null;

  @ApiPropertyOptional()
  template_id?: string | null;

  @ApiProperty()
  is_active: boolean;

  @ApiProperty()
  created_at: Date;

  @ApiProperty()
  updated_at: Date;
}

export class UserWebsiteResponseDto {
  @ApiProperty()
  website: WebsiteResponseDto;

  @ApiProperty({ description: 'User role in this website' })
  role: string;

  @ApiProperty()
  is_active: boolean;
}
