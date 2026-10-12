import { IsIn, IsOptional, IsString, Length } from 'class-validator';

export class UpdateGatheringPlanDto {
  @IsOptional()
  @IsString()
  @Length(3, 255)
  title?: string;

  @IsOptional()
  @IsIn(['OPEN', 'INVITE_ONLY'])
  invite_policy?: 'OPEN' | 'INVITE_ONLY';
}