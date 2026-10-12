import { IsDate, IsNumber, IsOptional, IsString, IsUUID, Length, Min } from 'class-validator';

export class CreateGatheringOccurrenceDto {
  @IsUUID()
  product_id: string;

  @IsUUID()
  organizer_id: string;

  @IsString()
  @Length(3, 255)
  title: string;

  @IsOptional()
  @IsDate()
  rsvp_open_at?: Date;

  @IsOptional()
  @IsDate()
  rsvp_close_at?: Date;

  @IsOptional()
  @IsDate()
  payment_deadline?: Date;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  price_per_seat: number;

  @IsString()
  @Length(3, 8)
  currency: string;

  @IsNumber()
  @Min(0)
  min_attendees: number;

  @IsNumber()
  @Min(1)
  max_attendees: number;

  @IsOptional()
  @IsString()
  final_location?: string;

  @IsOptional()
  @IsString()
  final_schedule?: string;

  @IsOptional()
  cancellation_policy_snapshot?: Record<string, any>;
}
