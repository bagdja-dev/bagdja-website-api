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
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@ApiTags('Website Products')
@Controller('api/websites/:websiteId/products')
@UseGuards(JwtAuthGuard, TenantStaffGuard, RolesGuard)
@ApiBearerAuth()
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @Roles('viewer')
  @ApiOperation({ summary: 'List products/services of a website (optional filter by type)' })
  async findAll(
    @Param('websiteId') websiteId: string,
    @Query('type') type?: string,
  ) {
    return this.productsService.findAll(websiteId, type);
  }

  @Get(':productId')
  @Roles('viewer')
  @ApiOperation({ summary: 'Get product detail' })
  async findOne(@Param('productId') productId: string) {
    return this.productsService.findOne(productId);
  }

  @Post()
  @Roles('editor')
  @ApiOperation({ summary: 'Add a new product' })
  async create(
    @Param('websiteId') websiteId: string,
    @Body() dto: CreateProductDto,
  ) {
    return this.productsService.create(websiteId, dto);
  }

  @Patch(':productId')
  @Roles('editor')
  @ApiOperation({ summary: 'Update a product' })
  async update(
    @Param('productId') productId: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(productId, dto);
  }

  @Delete(':productId')
  @Roles('admin')
  @ApiOperation({ summary: 'Delete a product (admin+ only)' })
  async remove(@Param('productId') productId: string) {
    return this.productsService.remove(productId);
  }
}
