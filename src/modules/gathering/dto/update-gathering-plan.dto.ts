import { IsArray, IsBoolean, IsDateString, IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class UpdateGatheringPlanDto {
  @IsOptional()
  @IsString()
  @Length(3, 255)
  title?: string;

  @IsOptional()
  @IsIn(['OPEN', 'INVITE_ONLY'])
  invite_policy?: 'OPEN' | 'INVITE_ONLY';

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  opened_option_ids?: string[];

  @IsOptional()
  @IsDateString()
  reservation_deadline?: string;

  @IsOptional()
  @IsDateString()
  payment_deadline?: string;

  @IsOptional()
  @IsDateString()
  event_at?: string;

  @IsOptional()
  @IsBoolean()
  submit_plan?: boolean;

  @IsOptional()
  @IsBoolean()
  reopen_planning?: boolean;

  @IsOptional()
  @IsBoolean()
  submit_invitations?: boolean;

  @IsOptional()
  @IsDateString()
  extend_reservation_until?: string;

  @IsOptional()
  @IsBoolean()
  confirm_reservations?: boolean;
}