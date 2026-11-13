import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull, Not, QueryFailedError, Repository } from 'typeorm';

import type { AuthUser } from '../../common/auth/auth-user';
import { ChatServiceClient } from '../../common/chat-service/chat-service.client';
import { Website } from '../../entities/website.entity';
import { WebsitePlatformAuditLog } from '../../entities/website-platform-audit-log.entity';
import {
  WebsitePlatformTemplateSubmission,
  type TemplateCheckReport,
  type WebsitePlatformTemplateSubmissionStatus,
} from '../../entities/website-platform-template-submission.entity';
import { WebsiteTemplate } from '../../entities/website-template.entity';
import { WebsiteTemplateVersion } from '../../entities/website-template-version.entity';
import {
  checkExternalTemplateManifest,
  compareSemver,
  isReservedTemplateSlug,
  toBootstrapStructure,
  toCatalogTemplateManifest,
  type ExternalTemplatePackageManifest,
  type ManifestCheckIssue,
} from '../templates/external-template-manifest';

import { NotificationsService } from '../notifications/notifications.service';
import { TemplateTrialService } from './template-trial.service';

import type { CreateTemplateSubmissionDto } from './dto/create-template-submission.dto';
import type { ReviewTemplateSubmissionDto } from './dto/review-template-submission.dto';
import {
  PAGE_OVERRIDE_FIXTURE,
  TemplatePublicationClient,
  TemplateServiceError,
  type CandidateFixture,
} from './template-publication.client';

type SubmissionViewerRole = 'designer' | 'reviewer' | 'super_admin';
type Status = WebsitePlatformTemplateSubmissionStatus;

/**
 * Alur template eksternal: daftar → cek package → review → approve = publish → aktivasi di Studio.
 * Spesifikasi: plan/website-builder/template-submission-review-publication-flow.md.
 */

/** Designer boleh mengubah data submission pada status ini. */
const EDITABLE_STATUSES: readonly Status[] = ['draft', 'check_failed', 'checked', 'changes_requested'];
/** "Cek package" boleh dijalankan pada status ini. */
const CHECKABLE_STATUSES: readonly Status[] = ['draft', 'check_failed', 'checked'];
/** Status yang menandakan sebuah package sedang/sudah memakai slug. */
const SLUG_HOLDING_STATUSES: readonly Status[] = [
  'submitted',
  'in_review',
  'publishing',
  'publish_failed',
  'published',
  'deprecated',
];
const BASE_FIXTURES: readonly CandidateFixture[] = ['home', 'page', 'empty'];

function hasErrors(issues: readonly { level: string }[]): boolean {
  return issues.some((issue) => issue.level === 'error');
}

function toHttpError(error: unknown): unknown {
  if (error instanceof TemplateServiceError) {
    return new HttpException(
      { statusCode: error.statusCode >= 500 ? 502 : error.statusCode, code: error.code, message: error.message },
      error.statusCode >= 500 ? 502 : error.statusCode,
    );
  }
  return error;
}

@Injectable()
export class WebsitePlatformTemplateSubmissionService {
  private readonly logger = new Logger(WebsitePlatformTemplateSubmissionService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(WebsitePlatformTemplateSubmission)
    private readonly submissions: Repository<WebsitePlatformTemplateSubmission>,
    @InjectRepository(WebsiteTemplate)
    private readonly templates: Repository<WebsiteTemplate>,
    @InjectRepository(WebsiteTemplateVersion)
    private readonly versions: Repository<WebsiteTemplateVersion>,
    @InjectRepository(Website)
    private readonly websites: Repository<Website>,
    private readonly chat: ChatServiceClient,
    private readonly publication: TemplatePublicationClient,
    private readonly notifications: NotificationsService,
    private readonly trials: TemplateTrialService,
  ) {}

  // ── Langkah 1: designer mendaftarkan package ───────────────────────────

  async createDraft(user: AuthUser, dto: CreateTemplateSubmissionDto) {
    const packageName = dto.packageName.trim();
    const packageVersion = dto.packageVersion.trim();
    await this.ensurePackageVersionAvailable(packageName, packageVersion);
    const submission = this.submissions.create({
      designer_user_id: user.userId,
      designer_email: user.email?.trim().toLowerCase() ?? null,
      name: null,
      slug: null,
      package_name: packageName,
      package_version: packageVersion,
      description: dto.description.trim(),
      changelog: dto.changelog.trim(),
      license: dto.license.trim(),
      demo_url: dto.demoUrl?.trim() || null,
      github_url: dto.githubUrl.trim(),
      discussion_topic_id: null,
      status: 'draft',
      publication_status: 'not_started',
      artifact_digest: null,
      publication_error: null,
      published_at: null,
      tarball_integrity: null,
      candidate_digest: null,
      manifest: null,
      check_report: null,
      checked_at: null,
      reviewer_user_id: null,
      review_note: null,
      submitted_at: null,
      reviewed_at: null,
    });
    return this.saveWithAudit(user.userId, 'template_submission.created', submission, {
      packageName,
      packageVersion,
    });
  }

  async updateDraft(user: AuthUser, submissionId: string, dto: CreateTemplateSubmissionDto) {
    const packageName = dto.packageName.trim();
    const packageVersion = dto.packageVersion.trim();
    const current = await this.findSubmission(submissionId);
    this.ensureOwner(current, user);
    this.ensureEditable(current, packageName, packageVersion);
    await this.ensurePackageVersionAvailable(packageName, packageVersion, submissionId);
    return this.updateLockedWithAudit(user.userId, submissionId, 'template_submission.updated', (submission) => {
      this.ensureOwner(submission, user);
      this.ensureEditable(submission, packageName, packageVersion);
      const coordinatesChanged =
        submission.package_name !== packageName || submission.package_version !== packageVersion;
      Object.assign(submission, {
        package_name: packageName,
        package_version: packageVersion,
        description: dto.description.trim(),
        changelog: dto.changelog.trim(),
        license: dto.license.trim(),
        demo_url: dto.demoUrl?.trim() || null,
        github_url: dto.githubUrl.trim(),
      });
      if (coordinatesChanged) this.resetCheck(submission);
      return { packageName, packageVersion, coordinatesChanged };
    });
  }

  /**
   * "Cek package" (§4.1): intake npm di publisher → validasi manifest → verifikasi slug →
   * render fixture standar di sandbox. Hasil disimpan sebagai laporan; tidak melempar
   * galat untuk masalah package, hanya untuk masalah akses/status.
   */
  async check(user: AuthUser, submissionId: string) {
    const started = await this.updateLockedWithAudit(user.userId, submissionId, 'template_submission.check_started', (submission) => {
      this.ensureOwner(submission, user);
      if (!CHECKABLE_STATUSES.includes(submission.status)) {
        throw new ConflictException('Cek package hanya bisa dijalankan pada draft.');
      }
      this.resetCheck(submission);
      submission.status = 'checking';
      return { packageName: submission.package_name, packageVersion: submission.package_version };
    });
    const { package_name: packageName, package_version: packageVersion } = started;

    const issues: ManifestCheckIssue[] = [];
    const renders: TemplateCheckReport['renders'] = [];
    let intake: Awaited<ReturnType<TemplatePublicationClient['intake']>> | null = null;
    let manifest: ExternalTemplatePackageManifest | null = null;

    try {
      intake = await this.publication.intake(packageName, packageVersion);
    } catch (error) {
      if (!(error instanceof TemplateServiceError)) throw error;
      issues.push({
        code: error.code,
        level: 'error',
        message:
          error.statusCode >= 500
            ? `Pemeriksaan tidak dapat dijalankan sekarang (${error.message}). Coba lagi beberapa saat lagi.`
            : error.message,
      });
    }

    if (intake) {
      const result = checkExternalTemplateManifest(intake.manifest, { packageVersion });
      issues.push(...result.issues);
      manifest = result.manifest;
    }
    if (manifest) {
      const slugIssue = await this.slugOwnershipIssue(manifest.slug, packageName, packageVersion, submissionId);
      if (slugIssue) issues.push(slugIssue);
    }
    if (intake && manifest && !hasErrors(issues)) {
      const fixtures: CandidateFixture[] = [
        ...BASE_FIXTURES,
        ...(manifest.pageOverrides ?? []).map((page) => PAGE_OVERRIDE_FIXTURE[page]),
      ];
      for (const fixture of fixtures) {
        try {
          const rendered = await this.publication.renderCandidate(intake.digest, fixture);
          renders.push({ fixture, ok: true, htmlBytes: rendered.htmlBytes, durationMs: rendered.durationMs });
          if (rendered.htmlBytes === 0) {
            issues.push({
              code: 'render_empty',
              level: 'warning',
              field: fixture,
              message: `Template tidak menghasilkan HTML untuk data contoh "${fixture}".`,
            });
          }
        } catch (error) {
          if (!(error instanceof TemplateServiceError)) throw error;
          renders.push({ fixture, ok: false, error: error.message });
          issues.push({
            code: 'render_failed',
            level: 'error',
            field: fixture,
            message: `Template gagal di-render dengan data contoh "${fixture}": ${error.message}`,
          });
        }
      }
    }

    const report: TemplateCheckReport = {
      issues,
      renders,
      package: intake
        ? {
            integrity: intake.tarballIntegrity,
            serverBundleBytes: intake.serverBundleBytes,
            clientBundleBytes: intake.clientBundleBytes,
          }
        : null,
    };
    const passed = Boolean(intake && manifest) && !hasErrors(issues);
    return this.updateLockedWithAudit(user.userId, submissionId, 'template_submission.checked', (submission) => {
      if (
        submission.status !== 'checking' ||
        submission.package_name !== packageName ||
        submission.package_version !== packageVersion
      ) {
        throw new ConflictException('Submission berubah selama pemeriksaan; jalankan Cek package lagi.');
      }
      submission.status = passed ? 'checked' : 'check_failed';
      submission.check_report = report;
      submission.checked_at = new Date();
      submission.tarball_integrity = intake?.tarballIntegrity ?? null;
      submission.candidate_digest = passed ? intake!.digest : null;
      submission.manifest = passed ? (manifest as unknown as Record<string, unknown>) : null;
      submission.name = passed ? manifest!.name : null;
      submission.slug = passed ? manifest!.slug : null;
      return {
        passed,
        digest: submission.candidate_digest,
        errorCount: issues.filter((issue) => issue.level === 'error').length,
      };
    });
  }

  async submit(user: AuthUser, submissionId: string) {
    const current = await this.findSubmission(submissionId);
    this.ensureOwner(current, user);
    if (current.status !== 'checked' || !current.slug || !current.candidate_digest) {
      throw new ConflictException('Jalankan Cek package sampai lolos sebelum mengajukan review.');
    }
    const slugIssue = await this.slugOwnershipIssue(
      current.slug,
      current.package_name,
      current.package_version,
      submissionId,
    );
    if (slugIssue) throw new ConflictException(slugIssue.message);
    return this.updateLockedWithAudit(user.userId, submissionId, 'template_submission.submitted', (submission) => {
      this.ensureOwner(submission, user);
      if (submission.status !== 'checked' || submission.candidate_digest !== current.candidate_digest) {
        throw new ConflictException('Jalankan Cek package sampai lolos sebelum mengajukan review.');
      }
      submission.status = 'submitted';
      submission.submitted_at = new Date();
      submission.reviewer_user_id = null;
      submission.reviewed_at = null;
      return { slug: submission.slug, digest: submission.candidate_digest };
    });
  }

  // ── Preview & isi bundle (designer pemilik dan reviewer) ───────────────

  async preview(user: AuthUser, role: SubmissionViewerRole, submissionId: string, fixture: CandidateFixture) {
    const submission = await this.findViewableCandidate(user, role, submissionId);
    try {
      const manifest = submission.manifest as { entry?: { client?: string } } | null;
      const [rendered, client] = await Promise.all([
        this.publication.renderCandidate(submission.candidate_digest!, fixture),
        manifest?.entry?.client
          ? this.publication.candidateFile(submission.candidate_digest!, 'client.js')
          : Promise.resolve(null),
      ]);
      return {
        submissionId,
        digest: rendered.digest,
        fixture,
        html: rendered.html,
        // Dijalankan platform di iframe opaque ber-CSP dengan data fixture (bukan data pembeli).
        clientScript: client?.content ?? null,
      };
    } catch (error) {
      throw toHttpError(error);
    }
  }

  async clientSource(user: AuthUser, role: SubmissionViewerRole, submissionId: string) {
    const submission = await this.findViewableCandidate(user, role, submissionId);
    try {
      const file = await this.publication.candidateFile(submission.candidate_digest!, 'client.js');
      return { submissionId, digest: file.digest, content: file.content, bytes: file.bytes };
    } catch (error) {
      throw toHttpError(error);
    }
  }

  // ── Langkah 2–3: review, approve = publish ─────────────────────────────

  async listMine(user: AuthUser) {
    return this.submissions.find({
      where: { designer_user_id: user.userId },
      order: { updated_at: 'DESC' },
      take: 100,
    });
  }

  async listReviewQueue() {
    return this.submissions.find({
      where: { status: In(['submitted', 'in_review', 'publish_failed']) },
      order: { submitted_at: 'ASC' },
      take: 100,
    });
  }

  async listPackages() {
    return this.submissions.find({ order: { updated_at: 'DESC' }, take: 500 });
  }

  async getSubmission(user: AuthUser, role: SubmissionViewerRole, submissionId: string) {
    const submission = await this.findSubmission(submissionId);
    if (submission.designer_user_id !== user.userId && !this.canReview(role)) {
      throw new ForbiddenException('You cannot view this template submission');
    }
    return submission;
  }

  async review(
    user: AuthUser,
    submissionId: string,
    dto: ReviewTemplateSubmissionDto,
    isSuperAdmin = false,
  ) {
    const reviewNote = dto.reviewNote?.trim() || null;
    if ((dto.status === 'changes_requested' || dto.status === 'rejected') && !reviewNote) {
      throw new BadRequestException('A review note is required for this decision');
    }

    let discussionTopicId: string | null = null;
    if (dto.status === 'changes_requested') {
      const current = await this.findSubmission(submissionId);
      this.ensureReviewable(current, user, isSuperAdmin);
      discussionTopicId = current.discussion_topic_id ?? (await this.createDiscussionTopic(current, user));
    }

    const action = dto.status === 'approved' ? 'template_submission.approved' : `template_submission.${dto.status}`;
    const saved = await this.updateLockedWithAudit(user.userId, submissionId, action, (submission) => {
      this.ensureReviewable(submission, user, isSuperAdmin);
      if (dto.status === 'in_review' && submission.status !== 'submitted') {
        throw new ConflictException('Only a submitted template can be claimed for review');
      }
      if (dto.status === 'approved' && !submission.candidate_digest) {
        throw new ConflictException('Template belum memiliki artefak hasil Cek package.');
      }
      const previousStatus = submission.status;
      submission.status = dto.status === 'approved' ? 'publishing' : dto.status;
      submission.reviewer_user_id = user.userId;
      submission.review_note = reviewNote;
      submission.reviewed_at = dto.status === 'in_review' ? null : new Date();
      submission.publication_error = null;
      if (dto.status === 'changes_requested') {
        submission.discussion_topic_id = submission.discussion_topic_id ?? discussionTopicId;
      }
      return {
        previousStatus,
        reviewNote,
        digest: submission.candidate_digest,
        discussionTopicId: submission.discussion_topic_id,
      };
    });

    if (dto.status === 'changes_requested') {
      const topicId = saved.discussion_topic_id ?? discussionTopicId;
      if (!topicId) throw new BadRequestException('Could not create the template discussion channel');
      const message = await this.chat.createMessage(topicId, {
        senderUserId: user.userId,
        senderDisplayName: user.username ?? user.email ?? 'Reviewer Bagdja',
        body: reviewNote!,
      });
      await this.submissions.update(submissionId, { updated_at: new Date(message.createdAt) });
    }
    if (dto.status === 'changes_requested' || dto.status === 'rejected') {
      // Keputusan T2: uji kandidat di website dihentikan (best-effort; keputusan review tetap tersimpan).
      await this.trials.endTrials(saved, dto.status).catch((error: unknown) =>
        this.logger.warn(`Gagal menghentikan uji template ${submissionId}: ${error instanceof Error ? error.message : error}`));
    }
    if (dto.status === 'approved') return this.publish(user.userId, submissionId);
    return saved;
  }

  /** "Coba lagi" setelah publikasi gagal karena infrastruktur (keputusan approve tetap berlaku). */
  async retryPublish(user: AuthUser, submissionId: string) {
    await this.updateLockedWithAudit(user.userId, submissionId, 'template_submission.publish_retried', (submission) => {
      if (submission.status !== 'publish_failed') {
        throw new ConflictException('Hanya publikasi yang gagal yang bisa dicoba lagi.');
      }
      if (submission.designer_user_id === user.userId) {
        throw new ForbiddenException('Designer tidak dapat menerbitkan template miliknya sendiri.');
      }
      submission.status = 'publishing';
      submission.publication_error = null;
      return { digest: submission.candidate_digest };
    });
    return this.publish(user.userId, submissionId);
  }

  /**
   * Reviewer membuka percakapan dengan designer kapan saja; percakapan berjalan di Inbox
   * (bukan di halaman submission). Idempoten: topik yang sudah ada dipakai ulang.
   */
  async startDiscussion(user: AuthUser, submissionId: string) {
    const current = await this.findSubmission(submissionId);
    if (current.designer_user_id === user.userId) {
      throw new ForbiddenException('Designer tidak dapat membuka diskusi review untuk template miliknya sendiri.');
    }
    if (current.discussion_topic_id) return current;
    if (current.status === 'draft' || current.status === 'checking') {
      throw new ConflictException('Diskusi dapat dibuka setelah template diperiksa atau diajukan.');
    }
    const topicId = await this.createDiscussionTopic(current, user);
    return this.updateLockedWithAudit(user.userId, submissionId, 'template_submission.discussion_started', (submission) => {
      submission.discussion_topic_id = submission.discussion_topic_id ?? topicId;
      return { discussionTopicId: submission.discussion_topic_id };
    });
  }

  // ── Setelah terbit: deprecate & revoke ────────────────────────────────

  async deprecate(user: AuthUser, submissionId: string, note: string | null) {
    return this.changeVersionStatus(user, submissionId, 'deprecated', note);
  }

  async revoke(user: AuthUser, submissionId: string, note: string) {
    const submission = await this.findSubmission(submissionId);
    if (submission.status !== 'published' && submission.status !== 'deprecated') {
      throw new ConflictException('Hanya versi yang sudah terbit yang bisa dicabut.');
    }
    try {
      await this.publication.withdraw(submission.slug!, submission.package_version);
    } catch (error) {
      throw toHttpError(error);
    }
    return this.changeVersionStatus(user, submissionId, 'revoked', note);
  }

  /** Jumlah website yang ter-pin ke versi submission ini (ditampilkan sebelum revoke). */
  async countPinnedWebsites(submissionId: string) {
    const version = await this.versions.findOne({ where: { submission_id: submissionId } });
    if (!version) return { submissionId, versionId: null, pinnedWebsites: 0 };
    const pinnedWebsites = await this.websites.count({ where: { template_version_id: version.id } });
    return { submissionId, versionId: version.id, pinnedWebsites };
  }

  async listDiscussions(user: AuthUser, role: SubmissionViewerRole) {
    const where =
      role === 'designer'
        ? { designer_user_id: user.userId, discussion_topic_id: Not(IsNull()) }
        : { discussion_topic_id: Not(IsNull()) };
    const submissions = await this.submissions.find({
      where,
      order: { updated_at: 'DESC' },
    });
    return submissions.map((submission) => ({
      id: submission.id,
      name: submission.name ?? submission.package_name,
      email: submission.designer_email ?? '',
      assignedToName: null,
      status: submission.status,
      topicId: submission.discussion_topic_id,
      updatedAt: submission.updated_at,
      createdAt: submission.created_at,
      packageName: submission.package_name,
      packageVersion: submission.package_version,
    }));
  }

  async getDiscussion(user: AuthUser, role: SubmissionViewerRole, submissionId: string) {
    const submission = await this.findSubmission(submissionId);
    if (submission.designer_user_id !== user.userId && !this.canReview(role)) {
      throw new ForbiddenException('You cannot view this template discussion');
    }
    if (!submission.discussion_topic_id) {
      throw new NotFoundException('No discussion is available for this template');
    }
    await this.ensureDiscussionParticipant(submission, user);
    const messages = await this.chat.listMessages(
      submission.discussion_topic_id,
      100,
      0,
      user.userId,
    );
    await this.chat.markTopicRead(submission.discussion_topic_id, user.userId);
    return {
      requestId: submission.id,
      status: 'discussion' as const,
      topicId: submission.discussion_topic_id,
      viewerUserId: user.userId,
      viewerRole:
        submission.designer_user_id === user.userId ? 'designer' : 'reviewer',
      applicantName: submission.name ?? submission.package_name,
      applicantEmail: submission.package_name,
      messages: messages.items.map((message) => ({
        ...message,
        // Keputusan R2: semua reviewer berbagi kanal yang sama dengan designer.
        senderRole: message.senderUserId === submission.designer_user_id ? 'designer' : 'reviewer',
      })),
    };
  }

  async sendDiscussionMessage(
    user: AuthUser,
    role: SubmissionViewerRole,
    submissionId: string,
    body: string,
  ) {
    const submission = await this.findSubmission(submissionId);
    if (submission.designer_user_id !== user.userId && !this.canReview(role)) {
      throw new ForbiddenException('You cannot send messages in this template discussion');
    }
    if (!submission.discussion_topic_id) {
      throw new NotFoundException('No discussion is available for this template');
    }
    await this.ensureDiscussionParticipant(submission, user);
    const message = await this.chat.createMessage(submission.discussion_topic_id, {
      senderUserId: user.userId,
      senderDisplayName: user.username ?? user.email ?? 'Bagdja user',
      body,
    });
    const updateResult = await this.submissions.update(submission.id, {
      updated_at: new Date(message.createdAt),
    });
    return { message, activityUpdated: (updateResult.affected ?? 0) > 0 };
  }

  private canReview(role: SubmissionViewerRole): boolean {
    return role === 'reviewer' || role === 'super_admin';
  }


  // ── Internal ───────────────────────────────────────────────────────────

  private async publish(actorUserId: string, submissionId: string) {
    const submission = await this.findSubmission(submissionId);
    if (submission.status !== 'publishing' || !submission.candidate_digest || !submission.slug || !submission.manifest) {
      throw new ConflictException('Submission is not ready to be published');
    }
    const manifest = submission.manifest as unknown as ExternalTemplatePackageManifest;
    let promotedWebsiteIds: string[] = [];
    try {
      await this.publication.release(submission.slug, submission.package_version, submission.candidate_digest);
      const published = await this.dataSource.transaction(async (manager) => {
        const submissionRepo = manager.getRepository(WebsitePlatformTemplateSubmission);
        const current = await submissionRepo.findOne({
          where: { id: submissionId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!current || current.status !== 'publishing' || current.candidate_digest !== submission.candidate_digest) {
          throw new ConflictException('Submission changed during publication');
        }

        const templateRepo = manager.getRepository(WebsiteTemplate);
        let template = await templateRepo.findOne({
          where: { slug: manifest.slug },
          lock: { mode: 'pessimistic_write' },
        });
        if (template && (template.source !== 'package' || template.package_name !== current.package_name)) {
          throw new ConflictException(`Slug "${manifest.slug}" sudah dimiliki template lain.`);
        }
        template ??= templateRepo.create({
          slug: manifest.slug,
          source: 'package',
          package_name: current.package_name,
          designer_user_id: current.designer_user_id,
          name: manifest.name,
          description: current.description,
          structure: {},
          is_active: false,
          business_profiles: [],
          manifest: null,
          preview_image: null,
        });
        template = await templateRepo.save(template);

        const versionRepo = manager.getRepository(WebsiteTemplateVersion);
        const version = await versionRepo.save(
          versionRepo.create({
            template_id: template.id,
            version: current.package_version,
            artifact_digest: current.candidate_digest!,
            manifest: current.manifest!,
            submission_id: current.id,
            status: 'published',
            status_note: null,
          }),
        );
        await this.refreshCatalog(manager, template.id, current.description);
        // Keputusan T5: website yang menguji kandidat ini pindah ke versi terbit (digest sama).
        promotedWebsiteIds = await this.trials.promoteTrials(manager, current.id, template, version);

        current.status = 'published';
        current.artifact_digest = current.candidate_digest;
        current.publication_status = 'published';
        current.publication_error = null;
        current.published_at = new Date();
        const saved = await submissionRepo.save(current);
        await this.writeAudit(manager, actorUserId, 'template_submission.published', current.id, {
          slug: manifest.slug,
          version: current.package_version,
          digest: current.candidate_digest,
          templateId: template.id,
          promotedTrialWebsites: promotedWebsiteIds.length,
        });
        return saved;
      });
      await this.trials.notifyPromoted(promotedWebsiteIds, published).catch(() => undefined);
      return published;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Template publication failed';
      await this.updateLockedWithAudit(actorUserId, submissionId, 'template_submission.publish_failed', (current) => {
        if (current.status === 'publishing') current.status = 'publish_failed';
        current.publication_error = message.slice(0, 2000);
        return { error: current.publication_error };
      });
      throw toHttpError(error);
    }
  }

  /** Sinkronkan cache katalog `website_templates` dengan versi published terbaru (semver). */
  private async refreshCatalog(manager: EntityManager, templateId: string, description?: string) {
    const templateRepo = manager.getRepository(WebsiteTemplate);
    const template = await templateRepo.findOneOrFail({ where: { id: templateId } });
    const published = await manager
      .getRepository(WebsiteTemplateVersion)
      .find({ where: { template_id: templateId, status: 'published' } });
    const latest = published.sort((a, b) => compareSemver(b.version, a.version))[0];
    if (!latest) {
      template.is_active = false;
    } else {
      const manifest = latest.manifest as unknown as ExternalTemplatePackageManifest;
      Object.assign(template, {
        name: manifest.name,
        ...(description !== undefined ? { description } : {}),
        preview_image: manifest.preview?.imageUrl ?? null,
        business_profiles: [...manifest.businessProfiles],
        manifest: toCatalogTemplateManifest(manifest) as unknown as Record<string, unknown>,
        structure: toBootstrapStructure(manifest),
        is_active: true,
      });
    }
    await templateRepo.save(template);
  }

  private async changeVersionStatus(
    user: AuthUser,
    submissionId: string,
    status: 'deprecated' | 'revoked',
    note: string | null,
  ) {
    const result = await this.dataSource.transaction(async (manager) => {
      const submissionRepo = manager.getRepository(WebsitePlatformTemplateSubmission);
      const submission = await submissionRepo.findOne({
        where: { id: submissionId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!submission) throw new NotFoundException('Template submission not found');
      const allowedFrom: Status[] = status === 'deprecated' ? ['published'] : ['published', 'deprecated'];
      if (!allowedFrom.includes(submission.status)) {
        throw new ConflictException(`Versi dengan status ${submission.status} tidak bisa diubah menjadi ${status}.`);
      }
      const versionRepo = manager.getRepository(WebsiteTemplateVersion);
      const version = await versionRepo.findOne({ where: { submission_id: submissionId } });
      if (!version) throw new NotFoundException('Published template version not found');
      version.status = status;
      version.status_note = note;
      version.status_changed_at = new Date();
      await versionRepo.save(version);
      await this.refreshCatalog(manager, version.template_id);

      const previousStatus = submission.status;
      submission.status = status;
      if (status === 'revoked') submission.publication_status = 'withdrawn';
      const saved = await submissionRepo.save(submission);
      const pinned = await manager
        .getRepository(Website)
        .find({ where: { template_version_id: version.id }, select: ['id'] });
      const pinnedWebsites = pinned.length;
      await this.writeAudit(manager, user.userId, `template_submission.${status}`, submissionId, {
        previousStatus,
        note,
        versionId: version.id,
        pinnedWebsites,
      });
      return { submission: saved, pinnedWebsites, websiteIds: pinned.map((website) => website.id) };
    });
    await this.notifyPinnedWebsites(result.websiteIds, status, result.submission, note);
    return { submission: result.submission, pinnedWebsites: result.pinnedWebsites };
  }

  /** Keputusan D3: owner & staf website yang memakai versi ini diberi tahu (best-effort). */
  private async notifyPinnedWebsites(
    websiteIds: string[],
    status: 'deprecated' | 'revoked',
    submission: WebsitePlatformTemplateSubmission,
    note: string | null,
  ) {
    const name = submission.name ?? submission.package_name;
    const version = submission.package_version;
    const input = status === 'revoked'
      ? {
          type: 'system' as const,
          severity: 'error' as const,
          title: 'Template website dicabut',
          message: `Versi ${version} template "${name}" dicabut oleh Bagdja${note ? `: ${note}` : ''}. ` +
            'Website Anda tidak dapat ditampilkan sampai Anda memilih template lain atau versi lain.',
          actionLabel: 'Atur template',
          actionUrl: '/studio/appearance',
          entityType: 'template_version',
          entityId: submission.id,
        }
      : {
          type: 'system' as const,
          severity: 'warning' as const,
          title: 'Versi template tidak lagi ditawarkan',
          message: `Template "${name}" versi ${version} tidak lagi tersedia untuk pemasangan baru. ` +
            'Website Anda tetap berjalan; perbarui saat versi baru tersedia.',
          actionLabel: 'Lihat template',
          actionUrl: '/studio/appearance',
          entityType: 'template_version',
          entityId: submission.id,
        };
    const results = await Promise.allSettled(
      websiteIds.map((websiteId) => this.notifications.notifyWebsiteStaff(websiteId, input)),
    );
    const failed = results.filter((item) => item.status === 'rejected').length;
    if (failed > 0) this.logger.warn(`Notifikasi ${status} template gagal untuk ${failed} website.`);
  }

  /**
   * Verifikasi slug (keputusan D4): bukan slug bawaan, tidak dimiliki package lain,
   * dan versi harus lebih baru dari semua versi yang pernah terbit untuk slug ini.
   */
  private async slugOwnershipIssue(
    slug: string,
    packageName: string,
    packageVersion: string,
    excludingSubmissionId: string,
  ): Promise<ManifestCheckIssue | null> {
    if (isReservedTemplateSlug(slug)) {
      return { code: 'slug_reserved', level: 'error', field: 'slug', message: `Slug "${slug}" dipakai template bawaan Bagdja.` };
    }
    const template = await this.templates.findOne({ where: { slug } });
    if (template && (template.source !== 'package' || template.package_name !== packageName)) {
      return {
        code: 'slug_taken',
        level: 'error',
        field: 'slug',
        message: `Slug "${slug}" sudah dimiliki template lain. Pilih slug lain di manifest.json.`,
      };
    }
    if (template) {
      const released = await this.versions.find({ where: { template_id: template.id }, select: ['version'] });
      const newest = released.map((row) => row.version).sort(compareSemver).pop();
      if (newest && compareSemver(packageVersion, newest) <= 0) {
        return {
          code: 'version_not_newer',
          level: 'error',
          field: 'version',
          message: `Versi ${packageVersion} harus lebih baru dari versi terbit terakhir (${newest}).`,
        };
      }
    }
    const competing = await this.submissions.findOne({
      where: {
        slug,
        package_name: Not(packageName),
        status: In([...SLUG_HOLDING_STATUSES]),
      },
      select: ['id'],
    });
    if (competing && competing.id !== excludingSubmissionId) {
      return {
        code: 'slug_taken',
        level: 'error',
        field: 'slug',
        message: `Slug "${slug}" sedang diajukan oleh package lain. Pilih slug lain di manifest.json.`,
      };
    }
    return null;
  }

  /**
   * Keputusan R2: reviewer mana pun boleh membaca & berkomentar di kanal pengajuan. Topik dibuat
   * dengan designer + reviewer pembuka; reviewer lain ditambahkan sebagai peserta saat pertama ikut.
   * Idempoten di chat-service; galat penambahan tidak menghalangi (sudah peserta).
   */
  private async ensureDiscussionParticipant(submission: WebsitePlatformTemplateSubmission, user: AuthUser) {
    if (!submission.discussion_topic_id || submission.designer_user_id === user.userId) return;
    try {
      await this.chat.addDirectParticipant(submission.discussion_topic_id, user.userId, user.email ?? null);
    } catch (error) {
      this.logger.debug?.(`Peserta diskusi ${user.userId} tidak ditambahkan: ${error instanceof Error ? error.message : error}`);
    }
  }

  private async createDiscussionTopic(submission: WebsitePlatformTemplateSubmission, user: AuthUser): Promise<string> {
    const topic = await this.chat.createDirectTopic({
      dmKey: `website-platform-template-submission:${submission.id}`,
      participantUserIds: [submission.designer_user_id, user.userId],
      name: `Review template: ${submission.name ?? submission.package_name}`,
      createdByUserId: user.userId,
      appClientType: 'web',
      appClientTypeName: 'Bagdja Website Platform',
      contextMetadata: [
        {
          type: 'website_platform_template_submission',
          name: 'Review template',
          data: { templateSubmissionId: submission.id },
        },
      ],
    });
    return topic.id;
  }

  private ensureEditable(
    submission: WebsitePlatformTemplateSubmission,
    packageName: string,
    packageVersion: string,
  ) {
    if (!EDITABLE_STATUSES.includes(submission.status)) {
      throw new ConflictException('Submission ini tidak dapat diubah pada status sekarang.');
    }
    if (
      submission.status === 'changes_requested' &&
      submission.package_name === packageName &&
      submission.package_version === packageVersion
    ) {
      throw new ConflictException('Versi npm tidak bisa diubah isinya. Terbitkan versi baru ke npm untuk revisi.');
    }
  }

  private ensureReviewable(
    submission: WebsitePlatformTemplateSubmission,
    user: AuthUser,
    isSuperAdmin: boolean,
  ) {
    if (submission.designer_user_id === user.userId) {
      throw new ForbiddenException('Designer tidak dapat mereview template miliknya sendiri.');
    }
    if (submission.status !== 'submitted' && submission.status !== 'in_review') {
      throw new ConflictException('Only submitted or in-review templates can be reviewed');
    }
    if (
      submission.status === 'in_review' &&
      submission.reviewer_user_id &&
      submission.reviewer_user_id !== user.userId &&
      !isSuperAdmin
    ) {
      throw new ConflictException('This template is already assigned to another reviewer');
    }
  }

  private resetCheck(submission: WebsitePlatformTemplateSubmission) {
    submission.status = 'draft';
    submission.name = null;
    submission.slug = null;
    submission.manifest = null;
    submission.candidate_digest = null;
    submission.tarball_integrity = null;
    submission.check_report = null;
    submission.checked_at = null;
  }

  private async findViewableCandidate(user: AuthUser, role: SubmissionViewerRole, submissionId: string) {
    const submission = await this.getSubmission(user, role, submissionId);
    if (!submission.candidate_digest) {
      throw new NotFoundException('Template belum memiliki artefak hasil Cek package.');
    }
    return submission;
  }

  private ensureOwner(submission: WebsitePlatformTemplateSubmission, user: AuthUser) {
    if (submission.designer_user_id !== user.userId) {
      throw new ForbiddenException('You can only manage your own template submissions');
    }
  }

  private async findSubmission(submissionId: string) {
    const submission = await this.submissions.findOne({ where: { id: submissionId } });
    if (!submission) throw new NotFoundException('Template submission not found');
    return submission;
  }

  private async ensurePackageVersionAvailable(packageName: string, packageVersion: string, excludingId?: string) {
    const existing = await this.submissions.findOne({
      where: { package_name: packageName, package_version: packageVersion },
    });
    if (existing && existing.id !== excludingId) {
      throw new ConflictException('This exact npm package version already has a submission');
    }
  }

  private async saveWithAudit(
    actorUserId: string,
    action: string,
    submission: WebsitePlatformTemplateSubmission,
    details: Record<string, unknown>,
  ) {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const submissionRepo = manager.getRepository(WebsitePlatformTemplateSubmission);
        const saved = await submissionRepo.save(submission);
        await this.writeAudit(manager, actorUserId, action, saved.id, details);
        return saved;
      });
    } catch (error) {
      this.throwForDuplicateSubmissionIdentity(error);
      throw error;
    }
  }

  private async updateLockedWithAudit(
    actorUserId: string,
    submissionId: string,
    action: string,
    update: (submission: WebsitePlatformTemplateSubmission) => Record<string, unknown>,
  ) {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const submissionRepo = manager.getRepository(WebsitePlatformTemplateSubmission);
        const submission = await submissionRepo.findOne({
          where: { id: submissionId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!submission) throw new NotFoundException('Template submission not found');
        const details = update(submission);
        const saved = await submissionRepo.save(submission);
        await this.writeAudit(manager, actorUserId, action, saved.id, details);
        return saved;
      });
    } catch (error) {
      this.throwForDuplicateSubmissionIdentity(error);
      throw error;
    }
  }

  private async writeAudit(
    manager: EntityManager,
    actorUserId: string,
    action: string,
    entityId: string,
    details: Record<string, unknown>,
  ) {
    const auditRepo = manager.getRepository(WebsitePlatformAuditLog);
    await auditRepo.save(
      auditRepo.create({
        actor_user_id: actorUserId,
        action,
        entity_type: 'template_submission',
        entity_id: entityId,
        details,
      }),
    );
  }

  private throwForDuplicateSubmissionIdentity(error: unknown): void {
    const driverError =
      error instanceof QueryFailedError ? error.driverError : undefined;
    if (
      driverError &&
      typeof driverError === 'object' &&
      'constraint' in driverError &&
      (driverError.constraint ===
        'uq_website_platform_template_submissions_package_version' ||
        driverError.constraint ===
          'uq_website_platform_template_submissions_slug_version')
    ) {
      throw new ConflictException('This package version or template slug already has a submission');
    }
  }
}
