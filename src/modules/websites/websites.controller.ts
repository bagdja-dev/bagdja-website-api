import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import {
  JwtAuthGuard,
  CurrentUser,
  AuthUser,
  TenantStaffGuard,
  Roles,
  RolesGuard,
} from '../../common/auth';

import { CheckWebsiteSlugDto, WebsiteSlugAvailabilityResponseDto } from './dto/check-website-slug.dto';
import { CreateWebsiteDto } from './dto/create-website.dto';
import { UpdateWebsiteDto } from './dto/update-website.dto';
import {
  UpdateWebsiteBusinessProfileDto,
  UpdateWebsiteModulesDto,
  WebsiteModulesResponseDto,
} from './dto/website-modules.dto';
import { WebsiteModulesService } from './website-modules.service';
import { WebsitesService } from './websites.service';

@ApiTags('User Websites')
@Controller('api/user')
export class UserWebsitesController {
  constructor(private readonly websitesService: WebsitesService) {}

  @Get('websites')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get all websites accessible by the authenticated user',
    description:
      'Setiap `website` menyertakan `business_profile` dan `enabled_modules` (snapshot mentah; `legacy` + array kosong = semua modul available aktif — pakai GET /api/websites/:id/modules untuk himpunan efektif).',
  })
  async getUserWebsites(@CurrentUser() user: AuthUser) {
    return this.websitesService.findWebsitesByUserId(user.userId);
  }
}

@ApiTags('Websites')
@Controller('api/websites')
export class WebsitesController {
  constructor(
    private readonly websitesService: WebsitesService,
    private readonly modulesService: WebsiteModulesService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create a new website (caller becomes owner)',
    description:
      '`business_profile` opsional: profile `available` → `enabled_modules` diisi preset profile (dependensi + inti). Tanpa nilai → `legacy` (semua modul aktif).',
  })
  @ApiResponse({ status: 201, description: 'Website created' })
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateWebsiteDto) {
    return this.websitesService.create(user.userId, dto, user.email);
  }

  @Get('slug-availability')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Check whether a website slug is available (Studio onboarding wizard)' })
  @ApiOkResponse({ type: WebsiteSlugAvailabilityResponseDto, description: 'Status ketersediaan slug untuk website baru.' })
  async checkSlugAvailability(@Query() query: CheckWebsiteSlugDto): Promise<WebsiteSlugAvailabilityResponseDto> {
    return this.websitesService.checkSlugAvailability(query.slug);
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

  @Get(':websiteId/modules')
  @UseGuards(JwtAuthGuard, TenantStaffGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get business profile and module state of a website (any member)' })
  @ApiOkResponse({
    type: WebsiteModulesResponseDto,
    description:
      'Profile, himpunan modul efektif, dan status tiap modul registry. `blockedReason` berisi alasan modul aktif tidak bisa dimatikan (inti, dipakai modul lain, transaksi/gathering berjalan).',
  })
  getModules(@Param('websiteId') websiteId: string): Promise<WebsiteModulesResponseDto> {
    return this.modulesService.getModules(websiteId);
  }

  @Patch(':websiteId/modules')
  @UseGuards(JwtAuthGuard, TenantStaffGuard, RolesGuard)
  @Roles('owner')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Enable/disable modules (owner only)' })
  @ApiOkResponse({
    type: WebsiteModulesResponseDto,
    description: 'State modul setelah perubahan. Mengaktifkan modul ikut mengaktifkan dependensinya. Data tidak pernah dihapus.',
  })
  @ApiBadRequestResponse({ description: 'Kunci tidak dikenal, modul `coming_soon` diaktifkan, atau kunci ada di enable & disable sekaligus.' })
  @ApiConflictResponse({
    description: 'Modul tidak bisa dimatikan: modul inti, masih dipakai modul aktif lain, atau ada transaksi/gathering berjalan.',
  })
  updateModules(
    @Param('websiteId') websiteId: string,
    @Body() dto: UpdateWebsiteModulesDto,
  ): Promise<WebsiteModulesResponseDto> {
    return this.modulesService.updateModules(websiteId, dto);
  }

  @Patch(':websiteId/business-profile')
  @UseGuards(JwtAuthGuard, TenantStaffGuard, RolesGuard)
  @Roles('owner')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change business profile, optionally applying its module preset (owner only)' })
  @ApiOkResponse({
    type: WebsiteModulesResponseDto,
    description:
      'State modul setelah ganti profile. `applyPreset: true` menambahkan modul preset profile baru; tidak ada modul yang dimatikan.',
  })
  @ApiBadRequestResponse({ description: 'Profile tidak dikenal, `legacy`, atau masih `coming_soon`.' })
  updateBusinessProfile(
    @Param('websiteId') websiteId: string,
    @Body() dto: UpdateWebsiteBusinessProfileDto,
  ): Promise<WebsiteModulesResponseDto> {
    return this.modulesService.updateBusinessProfile(websiteId, dto);
  }
}
