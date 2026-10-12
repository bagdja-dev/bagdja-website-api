import { IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class CreateGatheringPlanDto {
  @IsUUID()
  website_id: string;

  @IsUUID()
  product_id: string;

  @IsOptional()
  @IsString()
  @Length(3, 255)
  title?: string;

  @IsOptional()
  @IsIn(['OPEN', 'INVITE_ONLY'])
  invite_policy?: 'OPEN' | 'INVITE_ONLY';
}