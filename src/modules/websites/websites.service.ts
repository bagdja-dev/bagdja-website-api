import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { extractTemplateTheme, sanitizeWebsiteTheme } from '../../common/website-theme';
import {
  TenantStaff,
  Website,
  WebsitePlatformTemplateSubmission,
  WebsiteTemplate,
} from '../../entities';
import { PlanLimitService } from '../subscriptions/plan-limit.service';
import {
  toBootstrapStructure,
  type ExternalTemplatePackageManifest,
} from '../templates/external-template-manifest';
import { isRendererSupportedBuiltinManifest, isTemplateManifest } from '../templates/template-manifest';

import { LEGACY_BUSINESS_PROFILE, profilePresetModules, type BusinessProfileId, type ModuleKey } from './business-profile.registry';
import type { WebsiteSlugAvailabilityResponseDto } from './dto/check-website-slug.dto';
import { CreateWebsiteDto } from './dto/create-website.dto';
import { UpdateWebsiteDto } from './dto/update-website.dto';
import { WebsiteBootstrapService } from './website-bootstrap.service';
import { assertSelectableProfile } from './website-modules.service';
import { WebsiteTemplateVersionService } from './website-template-version.service';

/** Kolom identitas & kontak website — hanya owner yang boleh mengubah. */
export const WEBSITE_IDENTITY_FIELDS = ['name', 'tagline', 'logo_url', 'whatsapp', 'phone', 'email', 'social_links', 'opening_hours'] as const;
export const IDENTITY_OWNER_ONLY_MESSAGE = 'Hanya owner website yang dapat mengubah identitas.';

function sameIdentityValue(next: unknown, current: unknown): boolean {
  const isEmptyObject = (value: unknown): boolean =>
    typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).length === 0;
  const normalize = (value: unknown): string =>
    JSON.stringify(value === undefined || value === '' || isEmptyObject(value) ? null : value);
  return normalize(next) === normalize(current);
}

@Injectable()
export class WebsitesService {
  private readonly logger = new Logger(WebsitesService.name);

  constructor(
    @InjectRepository(Website)
    private readonly websiteRepo: Repository<Website>,
    @InjectRepository(TenantStaff)
    private readonly staffRepo: Repository<TenantStaff>,
    @InjectRepository(WebsiteTemplate)
    private readonly templateRepo: Repository<WebsiteTemplate>,
    @InjectRepository(WebsitePlatformTemplateSubmission)
    private readonly templateSubmissions: Repository<WebsitePlatformTemplateSubmission>,
    private readonly bootstrapService: WebsiteBootstrapService,
    private readonly planLimitService: PlanLimitService,
    private readonly templateVersionService: WebsiteTemplateVersionService,
  ) {}

  async findWebsitesByUserId(userId: string) {
    const staffRecords = await this.staffRepo.find({
      where: { user_id: userId, is_active: true },
      relations: ['website'],
      order: { created_at: 'DESC' },
    });

    return staffRecords.map((staff) => ({
      website: staff.website,
      role: staff.role,
      is_active: staff.is_active,
    }));
  }

  async findById(websiteId: string) {
    const website = await this.websiteRepo.findOne({
      where: { id: websiteId },
      relations: ['template'],
    });
    if (!website) throw new NotFoundException('Website not found');
    return website;
  }

  async findBySlug(slug: string) {
    const website = await this.websiteRepo.findOne({
      where: { slug },
      relations: ['template', 'pages'],
    });
    if (!website) throw new NotFoundException('Website not found');
    return website;
  }

  async checkSlugAvailability(slug: string): Promise<WebsiteSlugAvailabilityResponseDto> {
    const exists = await this.websiteRepo.exist({ where: { slug } });
    return { slug, available: !exists };
  }

  async create(userId: string, dto: CreateWebsiteDto, userEmail?: string) {
    // Studio S1: profile dari wizard → preset modul. Tanpa profile → legacy
    // dengan snapshot kosong = semua modul available (D7, perilaku lama).
    let businessProfile: BusinessProfileId = LEGACY_BUSINESS_PROFILE;
    let enabledModules: ModuleKey[] = [];
    if (dto.business_profile) {
      const profile = assertSelectableProfile(dto.business_profile);
      businessProfile = profile.id;
      enabledModules = profilePresetModules(profile.id);
    }

    // Plan limit enforcement (Fase 3 plan-subscription) — hitung website
    // yang SUDAH dimiliki user sebagai owner, sebelum bikin baru.
    const ownedWebsites = await this.staffRepo.count({
      where: { user_id: userId, role: 'owner', is_active: true },
    });
    await this.planLimitService.checkCanCreateWebsite(userId, ownedWebsites);

    const existing = await this.websiteRepo.findOne({ where: { slug: dto.slug } });
    if (existing) throw new ConflictException(`Slug "${dto.slug}" is already taken`);

    if (dto.domain) {
      const existingDomain = await this.websiteRepo.findOne({ where: { domain: dto.domain } });
      if (existingDomain) throw new ConflictException(`Domain "${dto.domain}" is already taken`);
    }

    const selectedTemplate = dto.template_id
      ? await this.templateRepo.findOne({ where: { id: dto.template_id } })
      : null;
    if (dto.template_id && (!selectedTemplate || !selectedTemplate.is_active || !this.isSelectableTemplate(selectedTemplate))) {
      throw new BadRequestException('Template tidak aktif atau belum didukung renderer.');
    }

    let trialStructure: Record<string, unknown> | undefined;
    if (dto.template_trial_submission_id) {
      if (!selectedTemplate || selectedTemplate.source !== 'package') {
        throw new BadRequestException('Versi uji hanya tersedia untuk template package.');
      }
      const submission = await this.templateSubmissions.findOne({
        where: { id: dto.template_trial_submission_id },
      });
      if (!submission || !this.canViewTemplateCandidate(submission, userId)) {
        throw new ForbiddenException('Kandidat template tidak tersedia untuk akun ini.');
      }
      if (!submission.manifest || submission.slug !== selectedTemplate.slug || !submission.candidate_digest) {
        throw new BadRequestException('Kandidat template tidak cocok dengan template yang dipilih.');
      }
      const candidateManifest = submission.manifest as unknown as ExternalTemplatePackageManifest;
      if (
        businessProfile &&
        candidateManifest.businessProfiles.length > 0 &&
        !candidateManifest.businessProfiles.includes(businessProfile)
      ) {
        throw new BadRequestException(`Template ini tidak mendukung jenis bisnis website (${businessProfile}).`);
      }
      trialStructure = toBootstrapStructure(candidateManifest);
    }

    let theme: Record<string, unknown> = {};
    if (dto.theme) {
      theme = sanitizeWebsiteTheme(dto.theme) as Record<string, unknown>;
    } else if (selectedTemplate) {
      theme = extractTemplateTheme(selectedTemplate.structure ?? null) as Record<string, unknown>;
    }

    const pin = selectedTemplate
      ? await this.templateVersionService.resolveInstallPin(selectedTemplate)
      : { template_version_id: null, template_runtime_version: null };

    const website = this.websiteRepo.create({
      name: dto.name,
      slug: dto.slug,
      domain: dto.domain ?? null,
      template_id: dto.template_id ?? null,
      trial_submission_id: dto.template_trial_submission_id ?? null,
      ...pin,
      tagline: dto.tagline ?? null,
      logo_url: dto.logo_url ?? null,
      whatsapp: dto.whatsapp ?? null,
      phone: dto.phone ?? null,
      email: dto.email ?? null,
      social_links: {},
      opening_hours: {},
      theme,
      business_profile: businessProfile,
      enabled_modules: enabledModules,
    });

    const saved = await this.websiteRepo.save(website);

    const ownerStaff = this.staffRepo.create({
      website_id: saved.id,
      user_id: userId,
      email: userEmail ?? null,
      role: 'owner',
      is_active: true,
      accepted_at: new Date(),
    });
    await this.staffRepo.save(ownerStaff);

    await this.bootstrapService.bootstrap(saved, dto.template_id ?? null, trialStructure);

    return this.findById(saved.id);
  }

  async update(websiteId: string, dto: UpdateWebsiteDto, callerRole: string | undefined) {
    const website = await this.findById(websiteId);

    // Identitas hanya boleh diubah owner; nilai yang sama dengan tersimpan tidak dianggap perubahan
    // (klien lama mengirim ulang seluruh form).
    if (callerRole !== 'owner') {
      const changesIdentity = WEBSITE_IDENTITY_FIELDS.some(
        (field) => dto[field] !== undefined && !sameIdentityValue(dto[field], website[field]),
      );
      if (changesIdentity) throw new ForbiddenException(IDENTITY_OWNER_ONLY_MESSAGE);
    }

    // Pin versi hanya berubah saat template diganti. Mengirim ulang template_id yang sama
    // (klien menyimpan seluruh form) TIDAK menaikkan versi; update versi lewat
    // POST /api/websites/:id/template-version/upgrade.
    let templateChanged = false;
    if (dto.template_id && dto.template_id !== website.template_id) {
      templateChanged = true;
      const template = await this.templateRepo.findOne({ where: { id: dto.template_id, is_active: true } });
      if (!template) throw new NotFoundException('Active website template not found');
      if (!this.isSelectableTemplate(template)) {
        throw new BadRequestException('Template belum didukung renderer.');
      }
      Object.assign(website, await this.templateVersionService.resolveInstallPin(template));
      website.template = template;
      website.template_id = template.id;
    }

    if (dto.slug && dto.slug !== website.slug) {
      const existing = await this.websiteRepo.findOne({ where: { slug: dto.slug } });
      if (existing) throw new ConflictException(`Slug "${dto.slug}" is already taken`);
    }

    const domainChanged = dto.domain !== undefined && (dto.domain || null) !== website.domain;
    if (domainChanged && dto.domain) {
      const existingDomain = await this.websiteRepo.findOne({ where: { domain: dto.domain } });
      if (existingDomain && existingDomain.id !== websiteId) {
        throw new ConflictException(`Domain "${dto.domain}" is already taken`);
      }

    }

    if (dto.theme !== undefined) {
      website.theme = sanitizeWebsiteTheme(dto.theme) as Record<string, unknown>;
    }

    const { theme: _theme, notification_sound_url: soundUrl, ...rest } = dto;
    void _theme; // dto.theme sudah ditangani eksplisit di atas (sanitize) — sengaja di-extract agar tidak ikut Object.assign
    Object.assign(website, rest);
    if (soundUrl !== undefined) {
      website.notification_sound_url = soundUrl?.trim() ? soundUrl.trim() : null;
    }

    // Domain berubah (termasuk dihapus) → verifikasi lama tidak lagi valid, wajib verifikasi ulang
    if (domainChanged) {
      website.domain_verification_token = null;
      website.domain_verified_at = null;
    }

    const saved = await this.websiteRepo.save(website);
    if (templateChanged) await this.seedSampleDataAfterTemplateChange(saved);
    return saved;
  }

  /** Keputusan S2 (template-sample-data-plan.md): website tanpa produk dapat data contoh template baru. */
  async seedSampleDataAfterTemplateChange(websiteOrId: Website | string): Promise<void> {
    const website = typeof websiteOrId === 'string' ? await this.findById(websiteOrId) : websiteOrId;
    try {
      await this.bootstrapService.seedSampleDataIfEmpty(website, website.template_id);
    } catch (error) {
      // Best-effort: penggantian template tetap tersimpan walau data contoh gagal dibuat.
      this.logger.warn(`Data contoh template gagal dibuat untuk website ${website.id}: ${error instanceof Error ? error.message : error}`);
    }
  }

  async removeSampleData(websiteId: string) {
    await this.findById(websiteId);
    return this.bootstrapService.removeSampleData(websiteId);
  }

  async remove(websiteId: string) {
    const website = await this.findById(websiteId);
    await this.websiteRepo.remove(website);
    return { deleted: true };
  }

  private isSelectableTemplate(template: WebsiteTemplate): boolean {
    if (template.source === 'package') {
      return (
        isTemplateManifest(template.manifest) &&
        !template.manifest.isBuiltin &&
        template.manifest.slug === template.slug
      );
    }
    return isRendererSupportedBuiltinManifest(template.manifest, template.slug);
  }

  private canViewTemplateCandidate(submission: WebsitePlatformTemplateSubmission, userId: string): boolean {
    const designerStatuses = ['checked', 'submitted', 'in_review', 'publishing', 'publish_failed'];
    const reviewerStatuses = ['in_review', 'publishing', 'publish_failed'];
    return (
      (submission.designer_user_id === userId && designerStatuses.includes(submission.status)) ||
      (submission.reviewer_user_id === userId && reviewerStatuses.includes(submission.status))
    );
  }
}
