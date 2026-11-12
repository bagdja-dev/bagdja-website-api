import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { extractTemplateTheme, sanitizeWebsiteTheme } from '../../common/website-theme';
import { TenantStaff, Website, WebsiteTemplate } from '../../entities';
import { PlanLimitService } from '../subscriptions/plan-limit.service';
import { isRendererSupportedBuiltinManifest, isTemplateManifest } from '../templates/template-manifest';

import { LEGACY_BUSINESS_PROFILE, profilePresetModules, type BusinessProfileId, type ModuleKey } from './business-profile.registry';
import type { WebsiteSlugAvailabilityResponseDto } from './dto/check-website-slug.dto';
import { CreateWebsiteDto } from './dto/create-website.dto';
import { UpdateWebsiteDto } from './dto/update-website.dto';
import { WebsiteBootstrapService } from './website-bootstrap.service';
import { WebsiteTemplateVersionService } from './website-template-version.service';
import { assertSelectableProfile } from './website-modules.service';

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
  constructor(
    @InjectRepository(Website)
    private readonly websiteRepo: Repository<Website>,
    @InjectRepository(TenantStaff)
    private readonly staffRepo: Repository<TenantStaff>,
    @InjectRepository(WebsiteTemplate)
    private readonly templateRepo: Repository<WebsiteTemplate>,
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

    await this.bootstrapService.bootstrap(saved, dto.template_id ?? null);

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
    if (dto.template_id && dto.template_id !== website.template_id) {
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

    return this.websiteRepo.save(website);
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
}
