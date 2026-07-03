import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { TemplatesService } from './templates.service';

@ApiTags('Templates')
@Controller('api/templates')
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Get()
  @ApiOperation({ summary: 'List all active website templates (public)' })
  async findAll() {
    return this.templatesService.findAll();
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
