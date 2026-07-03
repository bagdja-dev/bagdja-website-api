import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Headers,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import {
  JwtAuthGuard,
  CurrentUser,
  AuthUser,
  TenantStaffGuard,
  Roles,
  RolesGuard,
} from '../../common/auth';
import { WebsitesService } from './websites.service';
import { CreateWebsiteDto } from './dto/create-website.dto';
import { UpdateWebsiteDto } from './dto/update-website.dto';

@ApiTags('User Websites')
@Controller('api/user')
export class UserWebsitesController {
  constructor(private readonly websitesService: WebsitesService) {}

  @Get('websites')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all websites accessible by the authenticated user' })
  async getUserWebsites(@CurrentUser() user: AuthUser) {
    return this.websitesService.findWebsitesByUserId(user.userId);
  }
}

@ApiTags('Websites')
@Controller('api/websites')
export class WebsitesController {
  constructor(private readonly websitesService: WebsitesService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new website (caller becomes owner)' })
  @ApiResponse({ status: 201, description: 'Website created' })
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateWebsiteDto,
    @Headers('x-org-id') orgId: string,
  ) {
    return this.websitesService.create(
      orgId ?? 'default',
      user.userId,
      dto,
      user.email,
    );
  }

  @Get(':websiteId')
  @UseGuards(JwtAuthGuard, TenantStaffGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get website detail' })
  async findOne(@Param('websiteId') websiteId: string) {
    return this.websitesService.findById(websiteId);
  }

  @Patch(':websiteId')
  @UseGuards(JwtAuthGuard, TenantStaffGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update website settings (admin+ only)' })
  async update(
    @Param('websiteId') websiteId: string,
    @Body() dto: UpdateWebsiteDto,
  ) {
    return this.websitesService.update(websiteId, dto);
  }

  @Delete(':websiteId')
  @UseGuards(JwtAuthGuard, TenantStaffGuard, RolesGuard)
  @Roles('owner')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a website (owner only)' })
  async remove(@Param('websiteId') websiteId: string) {
    return this.websitesService.remove(websiteId);
  }
}
