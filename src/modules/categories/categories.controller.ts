import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  JwtAuthGuard,
  TenantStaffGuard,
  Roles,
  RolesGuard,
} from '../../common/auth';

import { CategoriesService } from './categories.service';
import { CategoryTranslationDto } from './dto/category-translation.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@ApiTags('Website Categories')
@Controller('api/websites/:websiteId/categories')
@UseGuards(JwtAuthGuard, TenantStaffGuard, RolesGuard)
@ApiBearerAuth()
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @Roles('viewer')
  @ApiOperation({ summary: 'List categories of a website' })
  async findAll(@Param('websiteId') websiteId: string) {
    return this.categoriesService.findAll(websiteId);
  }

  @Get(':categoryId')
  @Roles('viewer')
  @ApiOperation({ summary: 'Get category detail' })
  async findOne(@Param('websiteId') websiteId: string, @Param('categoryId') categoryId: string) {
    return this.categoriesService.findOne(categoryId, websiteId);
  }

  @Post()
  @Roles('editor')
  @ApiOperation({ summary: 'Add a new category' })
  async create(
    @Param('websiteId') websiteId: string,
    @Body() dto: CreateCategoryDto,
  ) {
    return this.categoriesService.create(websiteId, dto);
  }

  @Patch(':categoryId')
  @Roles('editor')
  @ApiOperation({ summary: 'Update a category' })
  async update(
    @Param('websiteId') websiteId: string,
    @Param('categoryId') categoryId: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(categoryId, websiteId, dto);
  }

  @Put(':categoryId/translations/:locale')
  @Roles('editor')
  @ApiOperation({ summary: 'Create or update a category translation' })
  async upsertTranslation(
    @Param('websiteId') websiteId: string,
    @Param('categoryId') categoryId: string,
    @Param('locale') locale: string,
    @Body() dto: CategoryTranslationDto,
  ) {
    return this.categoriesService.upsertTranslation(websiteId, categoryId, locale, dto);
  }

  @Delete(':categoryId')
  @Roles('admin')
  @ApiOperation({ summary: 'Delete a category (admin+ only) — products keep category_id set to null' })
  async remove(@Param('websiteId') websiteId: string, @Param('categoryId') categoryId: string) {
    return this.categoriesService.remove(websiteId, categoryId);
  }
}
