import { IsBoolean, IsNumber, IsOptional, IsString, IsUUID, Length, Min } from 'class-validator';

export class CreateGatheringOptionDto {
  @IsUUID()
  product_id: string;

  @IsUUID()
  group_id: string;

  @IsString()
  @Length(1, 64)
  option_key: string;

  @IsString()
  @Length(1, 255)
  label: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  availability_window?: Record<string, any>;

  @IsOptional()
  @IsNumber()
  @Min(0)
  capacity_limit?: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sort_order?: number;
}
