import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  JwtAuthGuard,
  TenantStaffGuard,
  Roles,
  RolesGuard,
} from '../../common/auth';
import { FaqsService } from './faqs.service';
import { CreateFaqDto } from './dto/create-faq.dto';
import { UpdateFaqDto } from './dto/update-faq.dto';
import { ReorderFaqsDto } from './dto/reorder-faqs.dto';

@ApiTags('Website FAQs')
@Controller('api/websites/:websiteId/faqs')
@UseGuards(JwtAuthGuard, TenantStaffGuard, RolesGuard)
@ApiBearerAuth()
export class FaqsController {
  constructor(private readonly faqsService: FaqsService) {}

  @Get()
  @Roles('viewer')
  @ApiOperation({ summary: 'List FAQs of a website' })
  async findAll(
    @Param('websiteId') websiteId: string,
    @Query('category') category?: string,
  ) {
    return this.faqsService.findAll(websiteId, category);
  }

  @Get(':faqId')
  @Roles('viewer')
  @ApiOperation({ summary: 'Get FAQ detail' })
  async findOne(@Param('faqId') faqId: string) {
    return this.faqsService.findOne(faqId);
  }

  @Post()
  @Roles('editor')
  @ApiOperation({ summary: 'Add a new FAQ' })
  async create(
    @Param('websiteId') websiteId: string,
    @Body() dto: CreateFaqDto,
  ) {
    return this.faqsService.create(websiteId, dto);
  }

  @Post('reorder')
  @Roles('editor')
  @ApiOperation({ summary: 'Reorder FAQs by ID array' })
  async reorder(
    @Param('websiteId') websiteId: string,
    @Body() dto: ReorderFaqsDto,
  ) {
    return this.faqsService.reorder(websiteId, dto);
  }

  @Patch(':faqId')
  @Roles('editor')
  @ApiOperation({ summary: 'Update a FAQ' })
  async update(
    @Param('faqId') faqId: string,
    @Body() dto: UpdateFaqDto,
  ) {
    return this.faqsService.update(faqId, dto);
  }

  @Delete(':faqId')
  @Roles('admin')
  @ApiOperation({ summary: 'Delete a FAQ (admin+ only)' })
  async remove(@Param('faqId') faqId: string) {
    return this.faqsService.remove(faqId);
  }
}
