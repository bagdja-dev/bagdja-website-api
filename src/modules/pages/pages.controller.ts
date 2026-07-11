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
import { PagesService } from './pages.service';
import { CreatePageDto } from './dto/create-page.dto';
import { UpdatePageDto } from './dto/update-page.dto';
import { ReorderPagesDto } from './dto/reorder-pages.dto';

@ApiTags('Website Pages')
@Controller('api/websites/:websiteId/pages')
@UseGuards(JwtAuthGuard, TenantStaffGuard, RolesGuard)
@ApiBearerAuth()
export class PagesController {
  constructor(private readonly pagesService: PagesService) {}

  @Get()
  @Roles('viewer')
  @ApiOperation({ summary: 'List all pages of a website' })
  async findAll(@Param('websiteId') websiteId: string) {
    return this.pagesService.findAll(websiteId);
  }

  @Get(':pageId')
  @Roles('viewer')
  @ApiOperation({ summary: 'Get a single page with its sections' })
  async findOne(@Param('pageId') pageId: string) {
    return this.pagesService.findOne(pageId);
  }

  @Post()
  @Roles('editor')
  @ApiOperation({ summary: 'Create a new page' })
  async create(
    @Param('websiteId') websiteId: string,
    @Body() dto: CreatePageDto,
  ) {
    return this.pagesService.create(websiteId, dto);
  }

  @Post('reorder')
  @Roles('editor')
  @ApiOperation({ summary: 'Reorder pages by ID array' })
  async reorder(
    @Param('websiteId') websiteId: string,
    @Body() dto: ReorderPagesDto,
  ) {
    return this.pagesService.reorder(websiteId, dto);
  }

  @Patch(':pageId')
  @Roles('editor')
  @ApiOperation({ summary: 'Update a page' })
  async update(
    @Param('websiteId') websiteId: string,
    @Param('pageId') pageId: string,
    @Body() dto: UpdatePageDto,
  ) {
    return this.pagesService.update(pageId, websiteId, dto);
  }

  @Delete(':pageId')
  @Roles('admin')
  @ApiOperation({ summary: 'Delete a page (admin+ only)' })
  async remove(@Param('pageId') pageId: string) {
    return this.pagesService.remove(pageId);
  }
}
