import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Put, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser, JwtAuthGuard, Roles, RolesGuard, TenantStaffGuard } from '../../common/auth';
import type { AuthUser } from '../../common/auth/auth-user';

import { TemplateCandidatePreviewResponseDto } from './dto/template-submission-response.dto';
import {
  StartTemplateTrialDto,
  TemplateCandidateResponseDto,
  TemplateTrialRuntimeEnvelopeDto,
  TemplateVersionOptionsResponseDto,
  WebsiteTemplateTrialResponseDto,
} from './dto/template-trial.dto';
import { PreviewTemplateCandidateQueryDto } from './dto/template-version-action.dto';
import { TemplateTrialService } from './template-trial.service';

/** Katalog kandidat untuk Studio (plan/website-builder/template-candidate-trial-plan.md §4). */
@ApiTags('Template Candidates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/template-candidates')
export class TemplateCandidatesController {
  constructor(private readonly trials: TemplateTrialService) {}

  @Get()
  @ApiOperation({
    summary: 'Template kandidat (belum terbit) yang boleh diuji user ini',
    description:
      'Designer melihat pengajuannya sejak status `submitted`; reviewer hanya melihat pengajuan yang ia ambil (`in_review`). ' +
      'Template yang sudah terbit tetap muncul di `GET /api/templates`.',
  })
  @ApiOkResponse({ type: [TemplateCandidateResponseDto], description: 'Daftar kandidat, terbaru lebih dulu (maks. 50).' })
  list(@CurrentUser() user: AuthUser): Promise<TemplateCandidateResponseDto[]> {
    return this.trials.listCandidates(user);
  }

  @Get(':submissionId/preview')
  @ApiOperation({ summary: 'Render kandidat dengan fixture standar untuk kartu katalog Studio' })
  @ApiOkResponse({
    type: TemplateCandidatePreviewResponseDto,
    description: 'HTML hasil SSR + isi client.js; Studio menjalankannya di iframe opaque ber-CSP tanpa jaringan.',
  })
  @ApiForbiddenResponse({ description: 'Kandidat tidak tersedia untuk akun ini.' })
  @ApiNotFoundResponse({ description: 'Pengajuan tidak ditemukan.' })
  preview(
    @CurrentUser() user: AuthUser,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
    @Query() query: PreviewTemplateCandidateQueryDto,
  ) {
    return this.trials.preview(user, submissionId, query.fixture);
  }
}

/** Pemilih versi template di Studio. */
@ApiTags('Template Candidates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/template-versions')
export class TemplateVersionOptionsController {
  constructor(private readonly trials: TemplateTrialService) {}

  @Get(':slug')
  @ApiOperation({
    summary: 'Versi template yang bisa dipilih user: semua versi terbit + versi uji miliknya',
    description:
      'Versi terbit dipasang untuk semua pengunjung (`POST /api/websites/:id/template-version/select`); ' +
      'versi kandidat hanya diuji (`PUT /api/websites/:id/template-trial`) dan hanya terlihat oleh user yang berhak.',
  })
  @ApiOkResponse({ type: TemplateVersionOptionsResponseDto, description: 'Opsi versi untuk slug template ini.' })
  options(@CurrentUser() user: AuthUser, @Param('slug') slug: string): Promise<TemplateVersionOptionsResponseDto> {
    return this.trials.listVersionOptions(user, slug);
  }
}

/** Uji kandidat per website (Studio → Tampilan). */
@ApiTags('Template Candidates')
@ApiBearerAuth()
@Controller('api/websites/:websiteId/template-trial')
export class WebsiteTemplateTrialController {
  constructor(private readonly trials: TemplateTrialService) {}

  @Get()
  @UseGuards(JwtAuthGuard, TenantStaffGuard)
  @ApiOperation({ summary: 'Uji template kandidat yang sedang aktif di website ini' })
  @ApiOkResponse({ type: WebsiteTemplateTrialResponseDto, description: 'Status uji untuk user ini.' })
  @ApiForbiddenResponse({ description: 'User bukan anggota aktif website ini.' })
  get(@CurrentUser() user: AuthUser, @Param('websiteId', ParseUUIDPipe) websiteId: string): Promise<WebsiteTemplateTrialResponseDto> {
    return this.trials.getWebsiteTrial(user, websiteId);
  }

  @Put()
  @UseGuards(JwtAuthGuard, TenantStaffGuard, RolesGuard)
  @Roles('admin')
  @ApiOperation({
    summary: 'Mulai uji template kandidat di website ini (admin+)',
    description:
      'Pengunjung tetap melihat template terpasang; kandidat hanya dirender untuk designer/reviewer yang berhak dan sedang login. ' +
      'Uji berhenti otomatis bila pengajuan diminta revisi/ditolak, dan pindah ke versi terbit saat kandidat terbit.',
  })
  @ApiOkResponse({ type: WebsiteTemplateTrialResponseDto, description: 'Status uji setelah dimulai.' })
  @ApiBadRequestResponse({ description: 'Template tidak mendukung jenis bisnis website.' })
  @ApiForbiddenResponse({ description: 'Bukan admin website, atau kandidat tidak tersedia untuk akun ini.' })
  @ApiNotFoundResponse({ description: 'Website atau pengajuan tidak ditemukan.' })
  start(
    @CurrentUser() user: AuthUser,
    @Param('websiteId', ParseUUIDPipe) websiteId: string,
    @Body() dto: StartTemplateTrialDto,
  ): Promise<WebsiteTemplateTrialResponseDto> {
    return this.trials.startTrial(user, websiteId, dto.submissionId);
  }

  @Delete()
  @UseGuards(JwtAuthGuard, TenantStaffGuard, RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Hentikan uji template kandidat (admin+)' })
  @ApiOkResponse({ type: WebsiteTemplateTrialResponseDto, description: 'Status uji setelah dihentikan (`candidate` null).' })
  @ApiForbiddenResponse({ description: 'Bukan admin website ini.' })
  stop(@CurrentUser() user: AuthUser, @Param('websiteId', ParseUUIDPipe) websiteId: string): Promise<WebsiteTemplateTrialResponseDto> {
    return this.trials.stopTrial(user, websiteId);
  }
}

/** Renderer: runtime kandidat untuk viewer yang login (keputusan T1). */
@ApiTags('Public')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/public/sites')
export class PublicTemplateTrialController {
  constructor(private readonly trials: TemplateTrialService) {}

  @Get(':slug/template-trial')
  @ApiOperation({
    summary: 'Runtime template kandidat untuk viewer ini',
    description: 'Dipanggil renderer hanya bila `template_trial_active` = true dan pengunjung login. Tanpa hak → `runtime: null`.',
  })
  @ApiOkResponse({ type: TemplateTrialRuntimeEnvelopeDto })
  async resolve(@CurrentUser() user: AuthUser, @Param('slug') slug: string): Promise<TemplateTrialRuntimeEnvelopeDto> {
    return { runtime: await this.trials.resolveForViewer(user, slug) };
  }
}
