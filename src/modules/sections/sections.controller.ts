import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  JwtAuthGuard,
  TenantStaffGuard,
  Roles,
  RolesGuard,
} from '../../common/auth';
import { SectionsService } from './sections.service';
import { CreateSectionDto } from './dto/create-section.dto';
import { UpdateSectionDto } from './dto/update-section.dto';
import { ReorderSectionsDto } from './dto/reorder-sections.dto';

@ApiTags('Page Sections')
@Controller('api/websites/:websiteId/pages/:pageId/sections')
@UseGuards(JwtAuthGuard, TenantStaffGuard, RolesGuard)
@ApiBearerAuth()
export class SectionsController {
  constructor(private readonly sectionsService: SectionsService) {}

  @Get()
  @Roles('viewer')
  @ApiOperation({ summary: 'List all sections in a page (ordered)' })
  async findAll(@Param('pageId') pageId: string) {
    return this.sectionsService.findByPage(pageId);
  }

  @Get(':sectionId')
  @Roles('viewer')
  @ApiOperation({ summary: 'Get a single section' })
  async findOne(@Param('sectionId') sectionId: string) {
    return this.sectionsService.findOne(sectionId);
  }

  @Post()
  @Roles('editor')
  @ApiOperation({ summary: 'Create a new section in this page' })
  async create(
    @Param('pageId') pageId: string,
    @Body() dto: CreateSectionDto,
  ) {
    return this.sectionsService.create(pageId, dto);
  }

  @Patch(':sectionId')
  @Roles('editor')
  @ApiOperation({ summary: 'Update a section' })
  async update(
    @Param('sectionId') sectionId: string,
    @Body() dto: UpdateSectionDto,
  ) {
    return this.sectionsService.update(sectionId, dto);
  }

  @Delete(':sectionId')
  @Roles('editor')
  @ApiOperation({ summary: 'Delete a section' })
  async remove(@Param('sectionId') sectionId: string) {
    return this.sectionsService.remove(sectionId);
  }

  @Post('reorder')
  @Roles('editor')
  @ApiOperation({ summary: 'Reorder sections within this page' })
  async reorder(
    @Param('pageId') pageId: string,
    @Body() dto: ReorderSectionsDto,
  ) {
    return this.sectionsService.reorder(pageId, dto.section_ids);
  }
}
