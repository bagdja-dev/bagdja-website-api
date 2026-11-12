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
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import {
  JwtAuthGuard,
  CurrentUser,
  CurrentStaff,
  AuthUser,
  TenantStaffGuard,
  Roles,
  RolesGuard,
} from '../../common/auth';
import type { TenantStaff } from '../../entities';

import { CheckWebsiteSlugDto, WebsiteSlugAvailabilityResponseDto } from './dto/check-website-slug.dto';
import { CreateWebsiteDto } from './dto/create-website.dto';
import { UpdateWebsiteDto } from './dto/update-website.dto';
import {
  UpdateWebsiteBusinessProfileDto,
  UpdateWebsiteModulesDto,
  WebsiteModulesResponseDto,
} from './dto/website-modules.dto';
import { WebsiteOnboardingLinkSharedResponseDto, WebsiteOnboardingStatusDto } from './dto/website-onboarding.dto';
import {
  UpgradeWebsiteTemplateVersionDto,
  WebsiteTemplateVersionStatusResponseDto,
} from './dto/website-template-version.dto';
import { WebsiteModulesService } from './website-modules.service';
import { WebsiteOnboardingService } from './website-onboarding.service';
import { WebsiteTemplateVersionService } from './website-template-version.service';
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
    private readonly onboardingService: WebsiteOnboardingService,
    private readonly templateVersionService: WebsiteTemplateVersionService,
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
  @ApiOperation({
    summary: 'Update website settings (admin+; identity fields owner only)',
    description:
      'Admin+ boleh mengubah pengaturan umum. Kolom identitas & kontak (`name`, `tagline`, `logo_url`, `whatsapp`, `phone`, `email`, `social_links`, `opening_hours`) hanya boleh diubah owner website; nilai yang sama dengan yang tersimpan tidak dianggap perubahan.',
  })
  @ApiOkResponse({ description: 'Website setelah diperbarui.' })
  @ApiForbiddenResponse({
    description:
      "Role di bawah admin, atau non-owner mengubah kolom identitas/kontak (pesan: 'Hanya owner website yang dapat mengubah identitas.').",
  })
  async update(
    @Param('websiteId') websiteId: string,
    @Body() dto: UpdateWebsiteDto,
    @CurrentStaff() staff: TenantStaff,
  ) {
    return this.websitesService.update(websiteId, dto, staff?.role);
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
      'State modul setelah ganti profile. `applyPreset: true` menambahkan modul preset tanpa mematikan modul lain. `resetFeaturesToPreset: true` menyelaraskan modul aktif dengan preset dan menolak modul yang masih dibutuhkan data berjalan.',
  })
  @ApiBadRequestResponse({ description: 'Profile tidak dikenal, `legacy`, atau masih `coming_soon`.' })
  @ApiConflictResponse({ description: 'Reset tidak dapat dilakukan karena modul memiliki transaksi atau gathering berjalan.' })
  updateBusinessProfile(
    @Param('websiteId') websiteId: string,
    @Body() dto: UpdateWebsiteBusinessProfileDto,
  ): Promise<WebsiteModulesResponseDto> {
    return this.modulesService.updateBusinessProfile(websiteId, dto);
  }

  @Get(':websiteId/onboarding-status')
  @UseGuards(JwtAuthGuard, TenantStaffGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get Studio home checklist status (any member)',
    description:
      'Sinyal checklist "Siapkan website kamu" di Studio Beranda dalam satu panggilan. Client tetap menyaring langkah berdasarkan modul aktif (`GET /api/websites/:id/modules`).',
  })
  @ApiOkResponse({
    type: WebsiteOnboardingStatusDto,
    description:
      'Flag tiap langkah checklist. `homeEdited` berbasis penanda `website_sections.is_seed` (bukan heuristik waktu); `seedProductCount` = produk contoh template yang masih ada; `teamCount` termasuk owner; `linkSharedAt` = ISO 8601 atau `null`.',
  })
  @ApiForbiddenResponse({ description: 'User bukan anggota aktif website ini.' })
  @ApiNotFoundResponse({ description: 'Website tidak ditemukan.' })
  getOnboardingStatus(@Param('websiteId') websiteId: string): Promise<WebsiteOnboardingStatusDto> {
    return this.onboardingService.getStatus(websiteId);
  }

  @Post(':websiteId/onboarding-status/link-shared')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, TenantStaffGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Mark the website link as shared from Studio home (any member, idempotent)',
    description: 'Mengisi `websites.link_shared_at` bila masih kosong. Panggilan ulang tidak mengubah waktu yang tersimpan.',
  })
  @ApiOkResponse({
    type: WebsiteOnboardingLinkSharedResponseDto,
    description: 'Waktu (ISO 8601) link pertama kali dibagikan — sama untuk setiap panggilan berikutnya.',
  })
  @ApiForbiddenResponse({ description: 'User bukan anggota aktif website ini.' })
  @ApiNotFoundResponse({ description: 'Website tidak ditemukan.' })
  markLinkShared(@Param('websiteId') websiteId: string): Promise<WebsiteOnboardingLinkSharedResponseDto> {
    return this.onboardingService.markLinkShared(websiteId);
  }

  @Get(':websiteId/template-version')
  @UseGuards(JwtAuthGuard, TenantStaffGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Versi template designer yang terpasang dan versi terbaru yang tersedia',
    description:
      'Untuk template bawaan `current`/`latest` bernilai null. `updateAvailable` dipakai Studio untuk menampilkan "Update tersedia"; versi tidak pernah naik otomatis.',
  })
  @ApiOkResponse({ type: WebsiteTemplateVersionStatusResponseDto })
  @ApiForbiddenResponse({ description: 'User bukan anggota aktif website ini.' })
  @ApiNotFoundResponse({ description: 'Website tidak ditemukan.' })
  getTemplateVersion(@Param('websiteId') websiteId: string): Promise<WebsiteTemplateVersionStatusResponseDto> {
    return this.templateVersionService.getStatus(websiteId);
  }

  @Post(':websiteId/template-version/upgrade')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, TenantStaffGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update eksplisit ke versi template designer yang lebih baru (admin+)',
    description: 'Hanya versi `published` dari template yang sama dan lebih baru dari versi terpasang.',
  })
  @ApiOkResponse({ type: WebsiteTemplateVersionStatusResponseDto, description: 'Status versi setelah update.' })
  @ApiConflictResponse({ description: 'Versi tidak lagi tersedia atau tidak lebih baru dari yang terpasang.' })
  @ApiNotFoundResponse({ description: 'Website atau versi tidak ditemukan untuk website ini.' })
  upgradeTemplateVersion(
    @Param('websiteId') websiteId: string,
    @Body() dto: UpgradeWebsiteTemplateVersionDto,
  ): Promise<WebsiteTemplateVersionStatusResponseDto> {
    return this.templateVersionService.upgrade(websiteId, dto.versionId);
  }
}
