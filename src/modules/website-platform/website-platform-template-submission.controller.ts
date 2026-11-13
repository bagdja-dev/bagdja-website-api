import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, JwtAuthGuard } from '../../common/auth';
import type { AuthUser } from '../../common/auth/auth-user';

import { CreateTemplateSubmissionDto as CreateTemplateSubmissionBody } from './dto/create-template-submission.dto';
import { ReviewTemplateSubmissionDto } from './dto/review-template-submission.dto';
import { SendAccessRequestDiscussionMessageDto } from './dto/send-access-request-discussion-message.dto';
import {
  TemplateCandidateClientSourceResponseDto,
  TemplateCandidatePreviewResponseDto,
  TemplatePinnedWebsitesResponseDto,
  TemplateSubmissionResponseDto,
  TemplateVersionStatusResponseDto,
} from './dto/template-submission-response.dto';
import { AddTemplateTesterDto, TemplateTesterTeamResponseDto } from './dto/template-trial.dto';
import {
  DeprecateTemplateVersionDto,
  PreviewTemplateCandidateQueryDto,
  RevokeTemplateVersionDto,
} from './dto/template-version-action.dto';
import { MAX_TEMPLATE_TESTERS, TemplateTrialService } from './template-trial.service';
import { WebsitePlatformTemplateSubmissionService } from './website-platform-template-submission.service';
import { WebsitePlatformService } from './website-platform.service';

type PlatformRole = 'super_admin' | 'designer' | 'reviewer';

function isPlatformRole(role: unknown): role is PlatformRole {
  return role === 'super_admin' || role === 'designer' || role === 'reviewer';
}

@ApiTags('Website Platform Templates')
@Controller('api/website-platform/templates')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WebsitePlatformTemplateSubmissionController {
  constructor(
    private readonly platform: WebsitePlatformService,
    private readonly submissions: WebsitePlatformTemplateSubmissionService,
    private readonly trials: TemplateTrialService,
  ) {}

  // ── Tim penguji designer (template-candidate-trial-plan.md §2.2) ─────────

  @Get('testers')
  @ApiOperation({
    summary: 'Tim penguji designer + website yang sedang menguji versinya',
    description:
      'Penguji dikenali dari email login: saat login di website yang sedang menguji versi uji designer ini, ' +
      'mereka melihat & bertransaksi dengan versi uji (tidak bisa memulai uji di website miliknya).',
  })
  @ApiOkResponse({ type: TemplateTesterTeamResponseDto, description: 'Daftar penguji (maks. 10) dan website uji aktif.' })
  async listTesters(
    @CurrentUser() user: AuthUser,
    @Headers('authorization') authorization?: string,
  ): Promise<TemplateTesterTeamResponseDto> {
    await this.requireRole(user, authorization, ['designer']);
    return this.testerTeam(user);
  }

  @Post('testers')
  @ApiOperation({ summary: 'Tambah penguji ke tim designer (maks. 10)' })
  @ApiOkResponse({ type: TemplateTesterTeamResponseDto, description: 'Tim penguji setelah ditambah.' })
  async addTester(
    @CurrentUser() user: AuthUser,
    @Body() dto: AddTemplateTesterDto,
    @Headers('authorization') authorization?: string,
  ): Promise<TemplateTesterTeamResponseDto> {
    await this.requireRole(user, authorization, ['designer']);
    await this.trials.addTester(user, dto.email);
    return this.testerTeam(user);
  }

  @Delete('testers/:testerId')
  @ApiOperation({ summary: 'Hapus penguji dari tim designer' })
  @ApiOkResponse({ type: TemplateTesterTeamResponseDto, description: 'Tim penguji setelah dihapus.' })
  async removeTester(
    @CurrentUser() user: AuthUser,
    @Param('testerId', ParseUUIDPipe) testerId: string,
    @Headers('authorization') authorization?: string,
  ): Promise<TemplateTesterTeamResponseDto> {
    await this.requireRole(user, authorization, ['designer']);
    await this.trials.removeTester(user, testerId);
    return this.testerTeam(user);
  }

  private async testerTeam(user: AuthUser): Promise<TemplateTesterTeamResponseDto> {
    const [testers, trialWebsites] = await Promise.all([
      this.trials.listTesters(user),
      this.trials.listDesignerTrialWebsites(user),
    ]);
    return { testers, trialWebsites, maxTesters: MAX_TEMPLATE_TESTERS };
  }

  @Get('submissions/mine')
  @ApiOperation({ summary: 'List the authenticated designer’s template submissions' })
  @ApiOkResponse({ type: [TemplateSubmissionResponseDto] })
  async listMine(
    @CurrentUser() user: AuthUser,
    @Headers('authorization') authorization?: string,
  ) {
    await this.requireRole(user, authorization, ['designer']);
    return this.submissions.listMine(user);
  }

  @Post('submissions')
  @ApiOperation({ summary: 'Create a draft template submission' })
  @ApiOkResponse({ type: TemplateSubmissionResponseDto })
  async create(
    @CurrentUser() user: AuthUser,
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: CreateTemplateSubmissionBody,
  ) {
    await this.requireRole(user, authorization, ['designer']);
    return this.submissions.createDraft(user, dto);
  }

  @Get('review-queue')
  @ApiOperation({ summary: 'List templates awaiting reviewer action' })
  @ApiOkResponse({ type: [TemplateSubmissionResponseDto] })
  async reviewQueue(
    @CurrentUser() user: AuthUser,
    @Headers('authorization') authorization?: string,
  ) {
    await this.requireRole(user, authorization, ['reviewer', 'super_admin']);
    return this.submissions.listReviewQueue();
  }

  @Get('discussions')
  @ApiOperation({ summary: 'List template discussions visible to the authenticated user' })
  async listDiscussions(
    @CurrentUser() user: AuthUser,
    @Headers('authorization') authorization?: string,
  ) {
    const role = await this.requireRole(
      user,
      authorization,
      ['designer', 'reviewer', 'super_admin'],
    );
    return this.submissions.listDiscussions(user, role);
  }

  @Get('packages')
  @ApiOperation({ summary: 'List all template packages and publication statuses for reviewers' })
  @ApiOkResponse({ type: [TemplateSubmissionResponseDto] })
  async listPackages(
    @CurrentUser() user: AuthUser,
    @Headers('authorization') authorization?: string,
  ) {
    await this.requireRole(user, authorization, ['reviewer', 'super_admin']);
    return this.submissions.listPackages();
  }

  @Get('submissions/:submissionId')
  @ApiOperation({ summary: 'Get an owned submission or a reviewer-visible submission' })
  @ApiOkResponse({ type: TemplateSubmissionResponseDto })
  async getSubmission(
    @CurrentUser() user: AuthUser,
    @Headers('authorization') authorization: string | undefined,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
  ) {
    const role = await this.requireRole(user, authorization, ['designer', 'reviewer', 'super_admin']);
    return this.submissions.getSubmission(user, role, submissionId);
  }

  @Patch('submissions/:submissionId')
  @ApiOperation({
    summary: 'Update a draft or a submission requiring changes',
    description:
      'Mengganti nama/versi package mengembalikan status ke draft dan menghapus hasil Cek package. ' +
      'Pada status changes_requested versi npm wajib diganti (versi npm immutable).',
  })
  @ApiOkResponse({ type: TemplateSubmissionResponseDto })
  async update(
    @CurrentUser() user: AuthUser,
    @Headers('authorization') authorization: string | undefined,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
    @Body() dto: CreateTemplateSubmissionBody,
  ) {
    await this.requireRole(user, authorization, ['designer']);
    return this.submissions.updateDraft(user, submissionId, dto);
  }

  @Post('submissions/:submissionId/submit')
  @ApiOperation({ summary: 'Submit a draft or revised template for review' })
  @ApiOkResponse({ type: TemplateSubmissionResponseDto })
  async submit(
    @CurrentUser() user: AuthUser,
    @Headers('authorization') authorization: string | undefined,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
  ) {
    await this.requireRole(user, authorization, ['designer']);
    return this.submissions.submit(user, submissionId);
  }

  @Post('submissions/:submissionId/review')
  @ApiOperation({
    summary: 'Claim, request changes, approve, or reject a template submission',
    description:
      'approved = langsung menerbitkan artefak hasil Cek package (status published, atau publish_failed bila infrastruktur gagal). ' +
      'Reviewer tidak boleh designer pemilik submission.',
  })
  @ApiOkResponse({ type: TemplateSubmissionResponseDto })
  async review(
    @CurrentUser() user: AuthUser,
    @Headers('authorization') authorization: string | undefined,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
    @Body() dto: ReviewTemplateSubmissionDto,
  ) {
    const role = await this.requireRole(user, authorization, ['reviewer', 'super_admin']);
    return this.submissions.review(user, submissionId, dto, role === 'super_admin');
  }

  @Post('submissions/:submissionId/check')
  @ApiOperation({
    summary: 'Cek package: ambil versi exact dari npm, validasi manifest & slug, render fixture standar',
    description:
      'Masalah package dilaporkan di check_report (status check_failed), bukan sebagai galat HTTP. ' +
      'Status checked berarti lolos dan siap diajukan.',
  })
  @ApiOkResponse({ type: TemplateSubmissionResponseDto })
  async check(
    @CurrentUser() user: AuthUser,
    @Headers('authorization') authorization: string | undefined,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
  ) {
    await this.requireRole(user, authorization, ['designer']);
    return this.submissions.check(user, submissionId);
  }

  @Get('submissions/:submissionId/preview')
  @ApiOperation({ summary: 'Render artefak kandidat dengan fixture standar untuk preview (iframe inert)' })
  @ApiOkResponse({ type: TemplateCandidatePreviewResponseDto })
  async preview(
    @CurrentUser() user: AuthUser,
    @Headers('authorization') authorization: string | undefined,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
    @Query() query: PreviewTemplateCandidateQueryDto,
  ) {
    const role = await this.requireRole(user, authorization, ['designer', 'reviewer', 'super_admin']);
    return this.submissions.preview(user, role, submissionId, query.fixture);
  }

  @Get('submissions/:submissionId/client-source')
  @ApiOperation({ summary: 'Isi dist/client.js artefak kandidat untuk dibaca reviewer sebelum approve' })
  @ApiOkResponse({ type: TemplateCandidateClientSourceResponseDto })
  async clientSource(
    @CurrentUser() user: AuthUser,
    @Headers('authorization') authorization: string | undefined,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
  ) {
    const role = await this.requireRole(user, authorization, ['designer', 'reviewer', 'super_admin']);
    return this.submissions.clientSource(user, role, submissionId);
  }

  @Post('submissions/:submissionId/retry-publish')
  @ApiOperation({ summary: 'Coba lagi menerbitkan submission yang publikasinya gagal (publish_failed)' })
  @ApiOkResponse({ type: TemplateSubmissionResponseDto })
  async retryPublish(
    @CurrentUser() user: AuthUser,
    @Headers('authorization') authorization: string | undefined,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
  ) {
    await this.requireRole(user, authorization, ['reviewer', 'super_admin']);
    return this.submissions.retryPublish(user, submissionId);
  }

  @Get('submissions/:submissionId/pinned-websites')
  @ApiOperation({ summary: 'Jumlah website yang memakai versi ini (ditampilkan sebelum revoke)' })
  @ApiOkResponse({ type: TemplatePinnedWebsitesResponseDto })
  async pinnedWebsites(
    @CurrentUser() user: AuthUser,
    @Headers('authorization') authorization: string | undefined,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
  ) {
    await this.requireRole(user, authorization, ['reviewer', 'super_admin']);
    return this.submissions.countPinnedWebsites(submissionId);
  }

  @Post('submissions/:submissionId/deprecate')
  @ApiOperation({
    summary: 'Deprecate versi terbit: hilang dari katalog, website yang sudah memakai tetap dirender',
  })
  @ApiOkResponse({ type: TemplateVersionStatusResponseDto })
  async deprecate(
    @CurrentUser() user: AuthUser,
    @Headers('authorization') authorization: string | undefined,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
    @Body() dto: DeprecateTemplateVersionDto,
  ) {
    await this.requireRole(user, authorization, ['reviewer', 'super_admin']);
    return this.submissions.deprecate(user, submissionId, dto.note?.trim() || null);
  }

  @Post('submissions/:submissionId/revoke')
  @ApiOperation({
    summary: 'Cabut versi terbit: hilang dari katalog dan website yang memakainya berhenti dirender',
  })
  @ApiOkResponse({ type: TemplateVersionStatusResponseDto })
  async revoke(
    @CurrentUser() user: AuthUser,
    @Headers('authorization') authorization: string | undefined,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
    @Body() dto: RevokeTemplateVersionDto,
  ) {
    await this.requireRole(user, authorization, ['reviewer', 'super_admin']);
    return this.submissions.revoke(user, submissionId, dto.note.trim());
  }

  @Post('submissions/:submissionId/discussion/start')
  @ApiOperation({
    summary: 'Reviewer membuka percakapan dengan designer di Inbox (idempoten)',
    description: 'Mengembalikan submission dengan discussion_topic_id; UI lalu mengarahkan ke /inbox?submissionId=…',
  })
  @ApiOkResponse({ type: TemplateSubmissionResponseDto })
  async startDiscussion(
    @CurrentUser() user: AuthUser,
    @Headers('authorization') authorization: string | undefined,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
  ) {
    await this.requireRole(user, authorization, ['reviewer', 'super_admin']);
    return this.submissions.startDiscussion(user, submissionId);
  }

  @Get('submissions/:submissionId/discussion')
  @ApiOperation({ summary: 'Get messages for an owned or reviewer-visible template discussion' })
  async getDiscussion(
    @CurrentUser() user: AuthUser,
    @Headers('authorization') authorization: string | undefined,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
  ) {
    const role = await this.requireRole(
      user,
      authorization,
      ['designer', 'reviewer', 'super_admin'],
    );
    return this.submissions.getDiscussion(user, role, submissionId);
  }

  @Post('submissions/:submissionId/discussion')
  @ApiOperation({ summary: 'Send a message in an owned or reviewer-visible template discussion' })
  async sendDiscussionMessage(
    @CurrentUser() user: AuthUser,
    @Headers('authorization') authorization: string | undefined,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
    @Body() dto: SendAccessRequestDiscussionMessageDto,
  ) {
    const role = await this.requireRole(
      user,
      authorization,
      ['designer', 'reviewer', 'super_admin'],
    );
    return this.submissions.sendDiscussionMessage(
      user,
      role,
      submissionId,
      dto.body,
    );
  }

  private async requireRole(
    user: AuthUser,
    authorization: string | undefined,
    allowedRoles: PlatformRole[],
  ): Promise<PlatformRole> {
    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('A valid bearer token is required');
    }
    const access = await this.platform.getAccess(user, authorization);
    if (!access.allowed || !isPlatformRole(access.role) || !allowedRoles.includes(access.role)) {
      throw new ForbiddenException('An active Website Platform role is required');
    }
    return access.role;
  }
}
