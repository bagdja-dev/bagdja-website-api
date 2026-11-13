import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { GOOGLE_MAPS_URL_PATTERN } from '../../../common/google-maps-url';

export class GatheringProductOptionInputDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  @Length(1, 64)
  option_group_key: string;

  @IsString()
  @Length(1, 64)
  option_key: string;

  @IsString()
  @Length(1, 255)
  label: string;

  /** HTML rich text ringan dari Studio (disanitasi profil `basic` saat disimpan). */
  @ApiPropertyOptional({ description: 'Keterangan opsi (HTML ringan: p, br, strong, em, u, s, ul, ol, li, a).', maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  price_per_seat: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  deposit_amount_per_seat?: number;

  @IsOptional()
  @IsString()
  @Length(3, 8)
  currency?: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  min_attendees: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  max_attendees: number;

  @IsOptional()
  @IsObject()
  availability_window?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  venue_location?: string;

  /** Alamat lengkap lokasi (plan gathering-option-location-plan.md). */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  venue_address?: string;

  /** Tautan Google Maps (https) — hanya domain Google Maps yang diterima. */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Matches(GOOGLE_MAPS_URL_PATTERN, { message: 'venue_map_url harus tautan Google Maps (https://maps.app.goo.gl/… atau https://www.google.com/maps/…)' })
  venue_map_url?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  benefits?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @IsObject()
  cancellation_policy?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort_order?: number;
}

export class ReplaceGatheringOptionsDto {
  @IsArray()
  @ArrayMinSize(0)
  @ValidateNested({ each: true })
  @Type(() => GatheringProductOptionInputDto)
  options: GatheringProductOptionInputDto[];
}