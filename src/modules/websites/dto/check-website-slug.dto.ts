import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class CheckWebsiteSlugDto {
  @ApiProperty({ example: 'barber-shop-jhon' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message: 'Slug must be lowercase alphanumeric with hyphens',
  })
  slug: string;
}

export class WebsiteSlugAvailabilityResponseDto {
  @ApiProperty({ example: 'barber-shop-jhon', description: 'Slug yang dicek.' })
  slug: string;

  @ApiProperty({ example: true, description: '`true` bila belum dipakai website lain.' })
  available: boolean;
}
