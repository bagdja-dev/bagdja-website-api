import {
  Controller,
  Get,
  Post,
  Put,
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

import { AssignFulfillmentFlowByTypeDto } from './dto/assign-fulfillment-flow-by-type.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { ReorderProductsDto } from './dto/reorder-products.dto';
import { ReplaceGatheringOptionsDto } from './dto/replace-gathering-options.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpsertProductTranslationDto } from './dto/upsert-product-translation.dto';
import { GatheringProductOptionsService } from './gathering-product-options.service';
import { ProductsService } from './products.service';

@ApiTags('Website Products')
@Controller('api/websites/:websiteId/products')
@UseGuards(JwtAuthGuard, TenantStaffGuard, RolesGuard)
@ApiBearerAuth()
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly gatheringProductOptionsService: GatheringProductOptionsService,
  ) {}

  @Get()
  @Roles('viewer')
  @ApiOperation({ summary: 'List products/services of a website (optional filter by type)' })
  async findAll(
    @Param('websiteId') websiteId: string,
    @Query('type') type?: string,
  ) {
    return this.productsService.findAll(websiteId, type);
  }

  @Post('reorder')
  @Roles('editor')
  @ApiOperation({ summary: 'Reorder top-level products by ID array' })
  async reorder(
    @Param('websiteId') websiteId: string,
    @Body() dto: ReorderProductsDto,
  ) {
    return this.productsService.reorder(websiteId, dto);
  }

  @Get('uoms/list')
  @Roles('viewer')
  @ApiOperation({ summary: 'List Master UOM aktif untuk produk' })
  async listUoms() {
    return this.productsService.listUoms();
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

  @Patch('fulfillment-flow-by-type')
  @Roles('editor')
  @ApiOperation({
    summary:
      'Assign/lepas fulfillment flow untuk SEMUA produk dengan type tertentu sekaligus — mempermudah setup awal (Order Handling Phase 3)',
  })
  async assignFulfillmentFlowByType(
    @Param('websiteId') websiteId: string,
    @Body() dto: AssignFulfillmentFlowByTypeDto,
  ) {
    return this.productsService.assignFulfillmentFlowByType(
      websiteId,
      dto.type,
      dto.fulfillment_flow_id ?? null,
    );
  }

  @Patch(':productId')
  @Roles('editor')
  @ApiOperation({ summary: 'Update a product' })
  async update(
    @Param('websiteId') websiteId: string,
    @Param('productId') productId: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(productId, websiteId, dto);
  }

  @Put(':productId/translations/:locale')
  @Roles('editor')
  @ApiOperation({ summary: 'Create or update a localized product/service translation' })
  async upsertTranslation(
    @Param('websiteId') websiteId: string,
    @Param('productId') productId: string,
    @Param('locale') locale: string,
    @Body() dto: UpsertProductTranslationDto,
  ) {
    return this.productsService.upsertTranslation(productId, websiteId, locale, dto);
  }

  @Get(':productId/gathering-options')
  @Roles('viewer')
  @ApiOperation({ summary: 'List gathering product options' })
  async findGatheringOptions(
    @Param('websiteId') websiteId: string,
    @Param('productId') productId: string,
  ) {
    return this.gatheringProductOptionsService.findForProduct(websiteId, productId);
  }

  @Put(':productId/gathering-options')
  @Roles('editor')
  @ApiOperation({ summary: 'Replace gathering product options' })
  async replaceGatheringOptions(
    @Param('websiteId') websiteId: string,
    @Param('productId') productId: string,
    @Body() dto: ReplaceGatheringOptionsDto,
  ) {
    return this.gatheringProductOptionsService.replaceForProduct(websiteId, productId, dto);
  }

  @Delete(':productId')
  @Roles('admin')
  @ApiOperation({ summary: 'Delete a product (admin+ only)' })
  async remove(@Param('productId') productId: string) {
    return this.productsService.remove(productId);
  }
}
