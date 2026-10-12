import { IsBoolean, IsNumber, IsOptional, IsString, IsUUID, Length, Min } from 'class-validator';

export class CreateGatheringOptionGroupDto {
  @IsUUID()
  product_id: string;

  @IsString()
  @Length(1, 64)
  group_key: string;

  @IsString()
  @Length(1, 255)
  label: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sort_order?: number;
}
