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
import { EntityManager, In, Repository } from 'typeorm';

import type { AuthUser } from '../../common/auth/auth-user';
import type { WebsiteTheme } from '../../common/website-theme';
import { WebsitePlatformMember } from '../../entities/website-platform-member.entity';
import {
  WebsitePlatformTemplateSubmission,
  type WebsitePlatformTemplateSubmissionStatus,
} from '../../entities/website-platform-template-submission.entity';
import { WebsitePlatformTemplateTester } from '../../entities/website-platform-template-tester.entity';
import { WebsiteTemplateVersion } from '../../entities/website-template-version.entity';
import { WebsiteTemplate } from '../../entities/website-template.entity';
import { Website } from '../../entities/website.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { manifestTemplateTheme } from '../public/template-runtime-resolution';
import { compareSemver, type ExternalTemplatePackageManifest } from '../templates/external-template-manifest';

import { TemplatePublicationClient, TemplateServiceError, type CandidateFixture } from './template-publication.client';

type Status = WebsitePlatformTemplateSubmissionStatus;
export type TemplateTrialViewerRole = 'designer' | 'reviewer';
/**
 * Akses lihat & transaksi versi uji (§2.2): pemula uji (designer/reviewer pemegang) +
 * `tester` (tim penguji designer) + `reviewer_team` (reviewer lain). Dua yang terakhir
 * tidak bisa memulai uji di website miliknya.
 */
export type TemplateTrialAccess = TemplateTrialViewerRole | 'tester' | 'reviewer_team';

export const MAX_TEMPLATE_TESTERS = 10;
const TESTER_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Keputusan T1 (revisi 12 Nov 2026): designer menguji kandidatnya sejak lolos Cek package, sebelum diajukan. */
export const DESIGNER_TRIAL_STATUSES: readonly Status[] = ['checked', 'submitted', 'in_review', 'publishing', 'publish_failed'];
/** Keputusan T4: reviewer pemegang bisa memulai uji setelah mengambil pengajuan. */
export const REVIEWER_TRIAL_STATUSES: readonly Status[] = ['in_review', 'publishing', 'publish_failed'];
/** Keputusan R1: semua reviewer melihat & bertransaksi selama pengajuan ada di antrean review. */
export const REVIEW_TEAM_TRIAL_STATUSES: readonly Status[] = ['submitted', 'in_review', 'publishing', 'publish_failed'];

const STATUS_LABELS: Partial<Record<Status, string>> = {
  checked: 'Belum diajukan',
  submitted: 'Menunggu review',
  in_review: 'Sedang direview',
  publishing: 'Sedang diterbitkan',
  publish_failed: 'Gagal terbit',
};

type TrialSubmission = Pick<
  WebsitePlatformTemplateSubmission,
  'designer_user_id' | 'reviewer_user_id' | 'status' | 'candidate_digest' | 'slug' | 'manifest'
>;

/** Peran viewer atas kandidat, atau null bila tidak berhak melihat/menguji. */
export function templateTrialViewerRole(submission: TrialSubmission, userId: string | null | undefined): TemplateTrialViewerRole | null {
  if (!userId || !submission.candidate_digest || !submission.slug || !submission.manifest) return null;
  if (submission.designer_user_id === userId && DESIGNER_TRIAL_STATUSES.includes(submission.status)) return 'designer';
  if (submission.reviewer_user_id === userId && REVIEWER_TRIAL_STATUSES.includes(submission.status)) return 'reviewer';
  return null;
}

export interface TemplateTrialViewer {
  userId: string;
  /** Anggota platform aktif ber-role reviewer. */
  isReviewer: boolean;
  /** Designer yang memasukkan email viewer ke tim pengujinya. */
  testerOfDesignerIds: ReadonlySet<string>;
}

/** Akses lihat & transaksi versi uji untuk viewer ini, atau null. */
export function templateTrialAccess(submission: TrialSubmission, viewer: TemplateTrialViewer): TemplateTrialAccess | null {
  const starter = templateTrialViewerRole(submission, viewer.userId);
  if (starter) return starter;
  if (!submission.candidate_digest || !submission.slug || !submission.manifest) return null;
  if (submission.designer_user_id === viewer.userId) return null;
  if (viewer.testerOfDesignerIds.has(submission.designer_user_id) && DESIGNER_TRIAL_STATUSES.includes(submission.status)) {
    return 'tester';
  }
  if (viewer.isReviewer && REVIEW_TEAM_TRIAL_STATUSES.includes(submission.status)) return 'reviewer_team';
  return null;
}

export interface TemplateTester {
  id: string;
  email: string;
  createdAt: Date;
}

export interface TemplateTrialWebsite {
  websiteName: string;
  websiteSlug: string;
  templateName: string;
  version: string;
  statusLabel: string;
}

export interface TemplateCandidate {
  submissionId: string;
  slug: string;
  name: string;
  version: string;
  description: string;
  changelog: string;
  status: Status;
  statusLabel: string;
  viewerRole: TemplateTrialViewerRole;
  businessProfiles: string[];
  pageOverrides: string[];
  hasClientScript: boolean;
  previewImageUrl: string | null;
  /** Versi terbit terbaru template yang sama (T3), null bila template baru. */
  publishedVersion: string | null;
  submittedAt: Date | null;
  /** Palet bawaan versi kandidat (`manifest.theme`), null bila tidak dideklarasikan. */
  theme: WebsiteTheme | null;
}

export interface TemplatePublishedVersionOption {
  versionId: string;
  version: string;
  changelog: string | null;
  publishedAt: Date;
  latest: boolean;
}

export interface TemplateVersionOptions {
  slug: string;
  templateId: string | null;
  /** Versi terbit yang bisa dipasang (tanpa deprecated/revoked), terbaru lebih dulu. */
  published: TemplatePublishedVersionOption[];
  /** Versi kandidat template ini yang boleh diuji user (T1/T4). */
  candidates: TemplateCandidate[];
}

export interface WebsiteTemplateTrial {
  websiteId: string;
  candidate: TemplateCandidate | null;
  /** Kandidat tersimpan tetapi user ini tidak berhak melihatnya. */
  hiddenFromYou: boolean;
}

export interface TemplateTrialRuntime {
  slug: string;
  version: string;
  status: 'candidate';
  pageOverrides: string[];
  candidateDigest: string;
  name: string;
  viewerRole: TemplateTrialAccess;
  theme?: WebsiteTheme;
}

function manifestOf(submission: WebsitePlatformTemplateSubmission): ExternalTemplatePackageManifest {
  return submission.manifest as unknown as ExternalTemplatePackageManifest;
}

function toHttpError(error: unknown): unknown {
  if (error instanceof TemplateServiceError) {
    const status = error.statusCode >= 500 ? 502 : error.statusCode;
    return new HttpException({ statusCode: status, code: error.code, message: error.message }, status);
  }
  return error;
}

/**
 * Uji template kandidat di website sungguhan sebelum terbit
 * (plan/website-builder/template-candidate-trial-plan.md).
 */
@Injectable()
export class TemplateTrialService {
  private readonly logger = new Logger(TemplateTrialService.name);

  constructor(
    @InjectRepository(WebsitePlatformTemplateSubmission)
    private readonly submissions: Repository<WebsitePlatformTemplateSubmission>,
    @InjectRepository(Website)
    private readonly websites: Repository<Website>,
    @InjectRepository(WebsiteTemplate)
    private readonly templates: Repository<WebsiteTemplate>,
    @InjectRepository(WebsiteTemplateVersion)
    private readonly versions: Repository<WebsiteTemplateVersion>,
    private readonly publication: TemplatePublicationClient,
    private readonly notifications: NotificationsService,
    @InjectRepository(WebsitePlatformMember)
    private readonly members: Repository<WebsitePlatformMember>,
    @InjectRepository(WebsitePlatformTemplateTester)
    private readonly testers: Repository<WebsitePlatformTemplateTester>,
  ) {}

  // ── Tim penguji designer (§2.2, U1–U4) ─────────────────────────────────

  async listTesters(designer: AuthUser): Promise<TemplateTester[]> {
    const rows = await this.testers.find({ where: { designer_user_id: designer.userId }, order: { created_at: 'ASC' } });
    return rows.map((row) => ({ id: row.id, email: row.email, createdAt: row.created_at }));
  }

  async addTester(designer: AuthUser, rawEmail: string): Promise<TemplateTester[]> {
    const email = rawEmail.trim().toLowerCase();
    if (!TESTER_EMAIL_PATTERN.test(email) || email.length > 320) {
      throw new BadRequestException('Email penguji tidak valid.');
    }
    if (designer.email && designer.email.toLowerCase() === email) {
      throw new BadRequestException('Anda sudah otomatis bisa menguji template Anda sendiri.');
    }
    const existing = await this.testers.find({ where: { designer_user_id: designer.userId } });
    if (existing.some((row) => row.email === email)) throw new ConflictException('Email ini sudah ada di tim penguji.');
    if (existing.length >= MAX_TEMPLATE_TESTERS) {
      throw new BadRequestException(`Tim penguji maksimal ${MAX_TEMPLATE_TESTERS} orang.`);
    }
    await this.testers.save(this.testers.create({ designer_user_id: designer.userId, email }));
    return this.listTesters(designer);
  }

  async removeTester(designer: AuthUser, testerId: string): Promise<TemplateTester[]> {
    const result = await this.testers.delete({ id: testerId, designer_user_id: designer.userId });
    if (!result.affected) throw new NotFoundException('Penguji tidak ditemukan.');
    return this.listTesters(designer);
  }

  /** Website yang sedang menguji versi milik designer ini — tautannya dibagikan ke tim penguji. */
  async listDesignerTrialWebsites(designer: AuthUser): Promise<TemplateTrialWebsite[]> {
    const submissions = await this.submissions.find({
      where: { designer_user_id: designer.userId, status: In([...DESIGNER_TRIAL_STATUSES]) },
    });
    if (!submissions.length) return [];
    const bySubmission = new Map(submissions.map((row) => [row.id, row]));
    const websites = await this.websites.find({
      where: { trial_submission_id: In([...bySubmission.keys()]), is_active: true },
      select: ['id', 'name', 'slug', 'trial_submission_id'],
    });
    return websites.map((website) => {
      const submission = bySubmission.get(website.trial_submission_id!)!;
      return {
        websiteName: website.name,
        websiteSlug: website.slug,
        templateName: submission.name ?? submission.package_name,
        version: submission.package_version,
        statusLabel: STATUS_LABELS[submission.status] ?? submission.status,
      };
    });
  }

  /** Konteks akses viewer: reviewer aktif? penguji dari designer mana? (§2.2) */
  async viewerContext(user: AuthUser): Promise<TemplateTrialViewer> {
    const email = user.email?.trim().toLowerCase();
    const [reviewer, testerRows] = await Promise.all([
      this.members.findOne({ where: { user_id: user.userId, role: 'reviewer', is_active: true }, select: ['id'] }),
      email ? this.testers.find({ where: { email }, select: ['designer_user_id'] }) : Promise.resolve([]),
    ]);
    return {
      userId: user.userId,
      isReviewer: Boolean(reviewer),
      testerOfDesignerIds: new Set(testerRows.map((row) => row.designer_user_id)),
    };
  }

  /** Katalog Studio: kandidat yang boleh dilihat user ini (T1, T3, T4). */
  async listCandidates(user: AuthUser): Promise<TemplateCandidate[]> {
    const rows = await this.submissions.find({
      where: [
        { designer_user_id: user.userId, status: In([...DESIGNER_TRIAL_STATUSES]) },
        { reviewer_user_id: user.userId, status: In([...REVIEWER_TRIAL_STATUSES]) },
      ],
      order: { submitted_at: 'DESC' },
      take: 50,
    });
    const visible = rows.filter((row) => templateTrialViewerRole(row, user.userId));
    const published = await this.publishedVersions(visible.map((row) => row.slug!));
    return visible.map((row) => this.toCandidate(row, templateTrialViewerRole(row, user.userId)!, published.get(row.slug!) ?? null));
  }

  /** Pemilih versi Studio: semua versi terbit + kandidat yang boleh diuji user, untuk satu slug. */
  async listVersionOptions(user: AuthUser, slug: string): Promise<TemplateVersionOptions> {
    const template = await this.templates.findOne({ where: { slug, source: 'package' } });
    const published = template
      ? await this.versions.find({ where: { template_id: template.id, status: 'published' } })
      : [];
    published.sort((a, b) => compareSemver(b.version, a.version));
    const changelogs = published.length
      ? new Map((await this.submissions.find({
        where: { id: In(published.map((row) => row.submission_id)) },
        select: ['id', 'changelog'],
      })).map((row) => [row.id, row.changelog]))
      : new Map<string, string>();
    const candidates = (await this.listCandidates(user)).filter((candidate) => candidate.slug === slug);
    return {
      slug,
      templateId: template?.id ?? null,
      published: published.map((row, index) => ({
        versionId: row.id,
        version: row.version,
        changelog: changelogs.get(row.submission_id) ?? null,
        publishedAt: row.published_at,
        latest: index === 0,
      })),
      candidates,
    };
  }

  async preview(user: AuthUser, submissionId: string, fixture: CandidateFixture) {
    const submission = await this.findEligible(user, submissionId);
    try {
      const [rendered, client] = await Promise.all([
        this.publication.renderCandidate(submission.candidate_digest!, fixture),
        manifestOf(submission).entry?.client
          ? this.publication.candidateFile(submission.candidate_digest!, 'client.js')
          : Promise.resolve(null),
      ]);
      return {
        submissionId,
        digest: rendered.digest,
        fixture,
        html: rendered.html,
        clientScript: client?.content ?? null,
      };
    } catch (error) {
      throw toHttpError(error);
    }
  }

  async getWebsiteTrial(user: AuthUser, websiteId: string): Promise<WebsiteTemplateTrial> {
    const website = await this.findWebsite(websiteId);
    if (!website.trial_submission_id) return { websiteId, candidate: null, hiddenFromYou: false };
    const submission = await this.submissions.findOne({ where: { id: website.trial_submission_id } });
    const role = submission ? templateTrialViewerRole(submission, user.userId) : null;
    if (!submission || !role) return { websiteId, candidate: null, hiddenFromYou: Boolean(submission) };
    const published = await this.publishedVersions([submission.slug!]);
    return { websiteId, candidate: this.toCandidate(submission, role, published.get(submission.slug!) ?? null), hiddenFromYou: false };
  }

  async startTrial(user: AuthUser, websiteId: string, submissionId: string): Promise<WebsiteTemplateTrial> {
    const website = await this.findWebsite(websiteId);
    const submission = await this.findEligible(user, submissionId);
    const profiles = manifestOf(submission).businessProfiles ?? [];
    if (website.business_profile && profiles.length && !profiles.includes(website.business_profile as never)) {
      throw new BadRequestException(`Template ini tidak mendukung jenis bisnis website (${website.business_profile}).`);
    }
    await this.websites.update(website.id, { trial_submission_id: submission.id });
    return this.getWebsiteTrial(user, websiteId);
  }

  async stopTrial(user: AuthUser, websiteId: string): Promise<WebsiteTemplateTrial> {
    const website = await this.findWebsite(websiteId);
    if (website.trial_submission_id) await this.websites.update(website.id, { trial_submission_id: null });
    return { websiteId, candidate: null, hiddenFromYou: false };
  }

  /** Renderer: runtime kandidat untuk viewer ini, null bila tidak ada uji atau tidak berhak (T1). */
  async resolveForViewer(user: AuthUser, websiteSlug: string): Promise<TemplateTrialRuntime | null> {
    const website = await this.websites.findOne({
      where: { slug: websiteSlug, is_active: true },
      select: ['id', 'trial_submission_id'],
    });
    if (!website?.trial_submission_id) return null;
    const submission = await this.submissions.findOne({ where: { id: website.trial_submission_id } });
    const role = submission ? templateTrialAccess(submission, await this.viewerContext(user)) : null;
    if (!submission || !role) return null;
    const manifest = manifestOf(submission);
    return {
      slug: submission.slug!,
      version: submission.package_version,
      status: 'candidate',
      pageOverrides: Array.isArray(manifest.pageOverrides) ? [...manifest.pageOverrides] : [],
      candidateDigest: submission.candidate_digest!,
      name: submission.name ?? manifest.name,
      viewerRole: role,
      ...(manifestTemplateTheme(manifest) ? { theme: manifestTemplateTheme(manifest) } : {}),
    };
  }

  // ── Hook dari alur review/publish ────────────────────────────────────────

  /** T2: revisi/tolak → hentikan uji di semua website + beri tahu staf. */
  async endTrials(submission: WebsitePlatformTemplateSubmission, decision: 'changes_requested' | 'rejected') {
    const pinned = await this.websites.find({ where: { trial_submission_id: submission.id }, select: ['id'] });
    if (!pinned.length) return;
    await this.websites.update({ trial_submission_id: submission.id }, { trial_submission_id: null });
    const name = submission.name ?? submission.package_name;
    await this.notifyStaff(pinned.map((row) => row.id), {
      type: 'system' as const,
      severity: 'warning' as const,
      title: 'Uji template dihentikan',
      message: `Template "${name}" versi ${submission.package_version} ${decision === 'rejected' ? 'ditolak' : 'diminta revisi'} ` +
        'oleh reviewer, sehingga uji di website ini dihentikan. Pengunjung tetap melihat template terpasang.',
      actionLabel: 'Atur template',
      actionUrl: '/studio/appearance',
      entityType: 'template_submission',
      entityId: submission.id,
    });
  }

  /** T5: kandidat terbit → website yang mengujinya pindah ke versi terbit (dalam transaksi publish). */
  async promoteTrials(
    manager: EntityManager,
    submissionId: string,
    template: WebsiteTemplate,
    version: WebsiteTemplateVersion,
  ): Promise<string[]> {
    const repo = manager.getRepository(Website);
    const pinned = await repo.find({ where: { trial_submission_id: submissionId }, select: ['id'] });
    if (!pinned.length) return [];
    await repo.update(
      { trial_submission_id: submissionId },
      {
        template_id: template.id,
        template_version_id: version.id,
        template_runtime_version: version.version,
        trial_submission_id: null,
      },
    );
    return pinned.map((row) => row.id);
  }

  async notifyPromoted(websiteIds: string[], submission: WebsitePlatformTemplateSubmission) {
    if (!websiteIds.length) return;
    const name = submission.name ?? submission.package_name;
    await this.notifyStaff(websiteIds, {
      type: 'system' as const,
      severity: 'info' as const,
      title: 'Template yang diuji telah terbit',
      message: `Template "${name}" versi ${submission.package_version} terbit dan kini terpasang untuk semua pengunjung website ini.`,
      actionLabel: 'Lihat tampilan',
      actionUrl: '/studio/appearance',
      entityType: 'template_submission',
      entityId: submission.id,
    });
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  private toCandidate(
    submission: WebsitePlatformTemplateSubmission,
    viewerRole: TemplateTrialViewerRole,
    publishedVersion: string | null,
  ): TemplateCandidate {
    const manifest = manifestOf(submission);
    return {
      submissionId: submission.id,
      slug: submission.slug!,
      name: submission.name ?? manifest.name,
      version: submission.package_version,
      description: submission.description,
      changelog: submission.changelog,
      status: submission.status,
      statusLabel: STATUS_LABELS[submission.status] ?? submission.status,
      viewerRole,
      businessProfiles: [...(manifest.businessProfiles ?? [])],
      pageOverrides: Array.isArray(manifest.pageOverrides) ? [...manifest.pageOverrides] : [],
      hasClientScript: Boolean(manifest.entry?.client),
      previewImageUrl: manifest.preview?.imageUrl ?? null,
      publishedVersion,
      submittedAt: submission.submitted_at,
      theme: manifestTemplateTheme(manifest) ?? null,
    };
  }

  private async publishedVersions(slugs: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(slugs)];
    if (!unique.length) return new Map();
    const templates = await this.templates.find({ where: { slug: In(unique), source: 'package' }, select: ['id', 'slug'] });
    if (!templates.length) return new Map();
    const versions = await this.versions.find({
      where: { template_id: In(templates.map((row) => row.id)), status: 'published' },
      select: ['template_id', 'version'],
    });
    const result = new Map<string, string>();
    for (const template of templates) {
      const latest = versions
        .filter((row) => row.template_id === template.id)
        .sort((a, b) => compareSemver(b.version, a.version))[0];
      if (latest) result.set(template.slug, latest.version);
    }
    return result;
  }

  private async findEligible(user: AuthUser, submissionId: string): Promise<WebsitePlatformTemplateSubmission> {
    const submission = await this.submissions.findOne({ where: { id: submissionId } });
    if (!submission) throw new NotFoundException('Template kandidat tidak ditemukan.');
    if (!templateTrialViewerRole(submission, user.userId)) {
      throw new ForbiddenException('Template kandidat ini tidak tersedia untuk akun Anda.');
    }
    return submission;
  }

  private async findWebsite(websiteId: string): Promise<Website> {
    const website = await this.websites.findOne({ where: { id: websiteId } });
    if (!website) throw new NotFoundException('Website not found');
    return website;
  }

  private async notifyStaff(
    websiteIds: string[],
    input: Parameters<NotificationsService['notifyWebsiteStaff']>[1],
  ) {
    const results = await Promise.allSettled(
      websiteIds.map((websiteId) => this.notifications.notifyWebsiteStaff(websiteId, input)),
    );
    const failed = results.filter((item) => item.status === 'rejected').length;
    if (failed > 0) this.logger.warn(`Notifikasi uji template gagal untuk ${failed} website.`);
  }
}
