import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { SELECTABLE_BUSINESS_PROFILE_IDS, type BusinessProfileId } from '../../websites/business-profile.registry';
import { TEMPLATE_CAPABILITIES, type TemplateCapability } from '../template-manifest';

import { SectionSchemaDto } from './section-schema.dto';

export class TemplateManifestPreviewDto {
  @ApiPropertyOptional({ example: 'https://cdn.example.com/templates/store-classic.png' })
  imageUrl?: string;

  @ApiPropertyOptional({ example: '/demo/store-classic' })
  demoPath?: string;
}

export class TemplateManifestResponseDto {
  @ApiProperty({ example: 'store-classic' })
  slug: string;

  @ApiProperty({ example: 'Store Classic' })
  name: string;

  @ApiProperty({ example: '1.0.0', description: 'Semver template.' })
  version: string;

  @ApiProperty({ enum: [1], example: 1 })
  rendererApiVersion: 1;

  @ApiProperty({ example: true, description: 'Template React internal (bawaan).' })
  isBuiltin: boolean;

  @ApiProperty({ enum: SELECTABLE_BUSINESS_PROFILE_IDS, isArray: true, example: ['online_store', 'digital_goods'] })
  businessProfiles: BusinessProfileId[];

  @ApiProperty({ enum: TEMPLATE_CAPABILITIES, isArray: true, example: ['catalog', 'cart', 'checkout', 'orders', 'blog', 'faq'] })
  capabilities: TemplateCapability[];

  @ApiProperty({ type: [String], example: ['hero', 'products_grid', 'faq_list'], description: 'Type section yang dirender template ini.' })
  sections: string[];

  @ApiPropertyOptional({ type: TemplateManifestPreviewDto })
  preview?: TemplateManifestPreviewDto;

  @ApiProperty({ type: [SectionSchemaDto], description: 'Skema untuk setiap section di `sections` (urutan sama; type tak dikenal dilewati).' })
  sectionSchemas: SectionSchemaDto[];
}
