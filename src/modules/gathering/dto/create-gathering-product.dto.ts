import { IsEnum, IsNumber, IsOptional, IsString, Length, Matches, Min } from 'class-validator';

export class CreateGatheringProductDto {
  @IsString()
  @Length(3, 200)
  name: string;

  @IsString()
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  slug: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(['gathering'])
  type: 'gathering';

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  price_per_seat: number;

  @IsString()
  currency: string;

  @IsNumber()
  @Min(0)
  min_attendees: number;

  @IsNumber()
  @Min(1)
  max_attendees: number;

  @IsOptional()
  cancellation_policy?: Record<string, any>;
}
