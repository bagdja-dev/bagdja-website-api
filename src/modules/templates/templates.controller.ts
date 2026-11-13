import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiInternalServerErrorResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { TemplateManifestResponseDto } from './dto/template-manifest.dto';
import { TemplateListQueryDto } from './dto/template-query.dto';
import type { TemplateManifestResponse } from './template-manifest';
import { TemplatesService } from './templates.service';

@ApiTags('Templates')
@Controller('api/templates')
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Get()
  @ApiOperation({
    summary: 'List active templates supported by the current renderer (public)',
    description:
      '`business_profile` opsional memfilter template yang direkomendasikan untuk profile tersebut. Tanpa parameter = semua template aktif yang manifest built-in, versi, API renderer, dan section-nya cocok dengan registry renderer.',
  })
  async findAll(@Query() query: TemplateListQueryDto) {
    return this.templatesService.findAll(query.business_profile);
  }

  @Get(':slug/manifest')
  @ApiOperation({ summary: 'Get template manifest + schemas of the sections it supports (public)' })
  @ApiOkResponse({
    type: TemplateManifestResponseDto,
    description:
      'Manifest template (versi, rendererApiVersion, capability, business profile, section yang dirender) beserta subset skema section untuk form Studio.',
  })
  @ApiNotFoundResponse({ description: 'Template tidak ada atau belum memiliki manifest.' })
  @ApiInternalServerErrorResponse({ description: 'Manifest tersimpan tidak sesuai kontrak.' })
  async getManifest(@Param('slug') slug: string): Promise<TemplateManifestResponse> {
    return this.templatesService.findManifestBySlug(slug);
  }

  @Get(':slugOrId')
  @ApiOperation({ summary: 'Get template detail by slug or UUID (public)' })
  async findOne(@Param('slugOrId') slugOrId: string) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId);
    if (isUuid) {
      return this.templatesService.findById(slugOrId);
    }
    return this.templatesService.findBySlug(slugOrId);
  }
}
