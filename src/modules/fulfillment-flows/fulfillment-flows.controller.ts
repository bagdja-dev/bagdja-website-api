import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard, RolesGuard, Roles, TenantStaffGuard } from '../../common/auth';
import { CreateFulfillmentFlowDto } from './dto/create-fulfillment-flow.dto';
import { UpdateFulfillmentFlowDto } from './dto/update-fulfillment-flow.dto';
import { FulfillmentFlowsService } from './fulfillment-flows.service';

/**
 * Order Handling Phase 3 (plan/website-builder/order-hanlde-plan.md §3.3) —
 * Master Flow CRUD, tenant-scoped (mengikuti pola `products.controller.ts`).
 */
@ApiTags('Fulfillment Flows')
@Controller('api/websites/:websiteId/fulfillment-flows')
@UseGuards(JwtAuthGuard, TenantStaffGuard, RolesGuard)
@ApiBearerAuth()
export class FulfillmentFlowsController {
  constructor(private readonly fulfillmentFlowsService: FulfillmentFlowsService) {}

  @Get()
  @Roles('viewer')
  @ApiOperation({ summary: 'List fulfillment flow milik website ini' })
  @ApiResponse({ status: 200, description: 'Daftar flow + steps-nya' })
  async findAll(@Param('websiteId') websiteId: string) {
    return this.fulfillmentFlowsService.findAll(websiteId);
  }

  @Get(':id')
  @Roles('viewer')
  @ApiOperation({ summary: 'Detail 1 fulfillment flow + steps-nya' })
  @ApiResponse({ status: 200, description: 'Detail flow' })
  async findOne(@Param('websiteId') websiteId: string, @Param('id') id: string) {
    return this.fulfillmentFlowsService.findOne(id, websiteId);
  }

  @Post()
  @Roles('editor')
  @ApiOperation({ summary: 'Buat fulfillment flow baru (+ steps-nya)' })
  @ApiResponse({ status: 201, description: 'Flow berhasil dibuat' })
  async create(
    @Param('websiteId') websiteId: string,
    @Body() dto: CreateFulfillmentFlowDto,
  ) {
    return this.fulfillmentFlowsService.create(websiteId, dto);
  }

  @Patch(':id')
  @Roles('editor')
  @ApiOperation({
    summary: 'Update fulfillment flow — kalau `steps` dikirim, MENGGANTI SELURUH step lama',
  })
  @ApiResponse({ status: 200, description: 'Flow berhasil diupdate' })
  async update(
    @Param('websiteId') websiteId: string,
    @Param('id') id: string,
    @Body() dto: UpdateFulfillmentFlowDto,
  ) {
    return this.fulfillmentFlowsService.update(id, websiteId, dto);
  }

  @Delete(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Hapus fulfillment flow (admin+ only) — produk yang memakainya jadi tanpa flow' })
  @ApiResponse({ status: 200, description: 'Flow berhasil dihapus' })
  async remove(@Param('websiteId') websiteId: string, @Param('id') id: string) {
    await this.fulfillmentFlowsService.remove(id, websiteId);
    return { success: true };
  }
}
