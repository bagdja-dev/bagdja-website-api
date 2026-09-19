import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  JwtAuthGuard,
  Roles,
  RolesGuard,
  TenantStaffGuard,
} from '../../common/auth';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';
import { VendorsService } from './vendors.service';

@ApiTags('Website Vendors')
@Controller('api/websites/:websiteId/vendors')
@UseGuards(JwtAuthGuard, TenantStaffGuard, RolesGuard)
@ApiBearerAuth()
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @Get()
  @Roles('viewer')
  @ApiOperation({ summary: 'List vendors for a website' })
  async findAll(@Param('websiteId') websiteId: string) {
    return this.vendorsService.findAll(websiteId);
  }

  @Get(':vendorId')
  @Roles('viewer')
  @ApiOperation({ summary: 'Get vendor detail' })
  async findOne(
    @Param('websiteId') websiteId: string,
    @Param('vendorId') vendorId: string,
  ) {
    return this.vendorsService.findOne(vendorId, websiteId);
  }

  @Post()
  @Roles('editor')
  @ApiOperation({ summary: 'Create a vendor and optional coverage locations' })
  async create(
    @Param('websiteId') websiteId: string,
    @Body() dto: CreateVendorDto,
  ) {
    return this.vendorsService.create(websiteId, dto);
  }

  @Patch(':vendorId')
  @Roles('editor')
  @ApiOperation({ summary: 'Update vendor data and optional coverage locations' })
  async update(
    @Param('websiteId') websiteId: string,
    @Param('vendorId') vendorId: string,
    @Body() dto: UpdateVendorDto,
  ) {
    return this.vendorsService.update(vendorId, websiteId, dto);
  }

  @Delete(':vendorId')
  @Roles('admin')
  @ApiOperation({ summary: 'Delete a vendor (soft deactivate via status=inactive in MVP)' })
  async remove(
    @Param('websiteId') websiteId: string,
    @Param('vendorId') vendorId: string,
  ) {
    return this.vendorsService.remove(vendorId, websiteId);
  }
}
