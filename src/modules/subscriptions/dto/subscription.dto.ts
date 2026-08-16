import { IsBoolean, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SubscribePlanDto {
  @ApiProperty({ description: 'ID SubscriptionPlan yang mau di-subscribe' })
  @IsUUID()
  planId: string;
}

export class CancelSubscriptionDto {
  @ApiPropertyOptional({
    description:
      'Default true: tetap aktif sampai akhir periode. false = batalkan seketika.',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  cancelAtPeriodEnd?: boolean;
}
