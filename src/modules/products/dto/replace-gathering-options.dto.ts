import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';

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

  @IsOptional()
  @IsString()
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

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  benefits?: string[];

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