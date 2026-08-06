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
import { CategoriesService } from './categories.service';
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
  async findOne(@Param('categoryId') categoryId: string) {
    return this.categoriesService.findOne(categoryId);
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

  @Delete(':categoryId')
  @Roles('admin')
  @ApiOperation({ summary: 'Delete a category (admin+ only) — products keep category_id set to null' })
  async remove(@Param('categoryId') categoryId: string) {
    return this.categoriesService.remove(categoryId);
  }
}
