import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

import { SELECTABLE_BUSINESS_PROFILE_IDS, type BusinessProfileId } from '../../websites/business-profile.registry';

export class TemplateListQueryDto {
  @ApiPropertyOptional({
    enum: SELECTABLE_BUSINESS_PROFILE_IDS,
    example: 'online_store',
    description: 'Hanya template yang direkomendasikan untuk profile ini (`business_profiles @> ARRAY[id]`). Tanpa parameter = semua template aktif.',
  })
  @IsOptional()
  @IsIn([...SELECTABLE_BUSINESS_PROFILE_IDS])
  business_profile?: BusinessProfileId;
}
