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
import { LocationsService } from './locations.service';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';

@ApiTags('Website Locations')
@Controller('api/websites/:websiteId/locations')
@UseGuards(JwtAuthGuard, TenantStaffGuard, RolesGuard)
@ApiBearerAuth()
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Get()
  @Roles('viewer')
  @ApiOperation({ summary: 'List locations of a website' })
  async findAll(
    @Param('websiteId') websiteId: string,
    @Query('type') type?: string,
  ) {
    return this.locationsService.findAll(websiteId, type);
  }

  @Get(':locationId')
  @Roles('viewer')
  @ApiOperation({ summary: 'Get location detail' })
  async findOne(@Param('locationId') locationId: string) {
    return this.locationsService.findOne(locationId);
  }

  @Post()
  @Roles('editor')
  @ApiOperation({ summary: 'Add a new location' })
  async create(
    @Param('websiteId') websiteId: string,
    @Body() dto: CreateLocationDto,
  ) {
    return this.locationsService.create(websiteId, dto);
  }

  @Patch(':locationId')
  @Roles('editor')
  @ApiOperation({ summary: 'Update a location' })
  async update(
    @Param('websiteId') websiteId: string,
    @Param('locationId') locationId: string,
    @Body() dto: UpdateLocationDto,
  ) {
    return this.locationsService.update(locationId, websiteId, dto);
  }

  @Post(':locationId/set-primary')
  @Roles('editor')
  @ApiOperation({ summary: 'Set location as primary branch' })
  async setPrimary(
    @Param('websiteId') websiteId: string,
    @Param('locationId') locationId: string,
  ) {
    return this.locationsService.setPrimary(locationId, websiteId);
  }

  @Delete(':locationId')
  @Roles('admin')
  @ApiOperation({ summary: 'Delete a location (admin+ only)' })
  async remove(@Param('locationId') locationId: string) {
    return this.locationsService.remove(locationId);
  }
}
