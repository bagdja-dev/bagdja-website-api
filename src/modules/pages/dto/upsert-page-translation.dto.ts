import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpsertPageTranslationDto {
  @ApiProperty({ example: 'about-us', maxLength: 255 })
  @IsString()
  @MaxLength(255)
  slug: string;

  @ApiProperty({ example: 'About Us', maxLength: 255 })
  @IsString()
  @MaxLength(255)
  title: string;

  @ApiProperty({ example: 'About Us | Acme', maxLength: 255, required: false, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  seo_title?: string | null;

  @ApiProperty({ example: 'Learn more about our team.', maxLength: 500, required: false, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  seo_description?: string | null;

  @ApiProperty({ example: 'https://example.com/about-share.png', maxLength: 1000, required: false, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  seo_image?: string | null;

  @ApiProperty({ example: false, required: false })
  @IsOptional()
  @IsBoolean()
  seo_no_index?: boolean;
}
