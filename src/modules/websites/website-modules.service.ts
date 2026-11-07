import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { BusinessProfileWaitlist, Website, WebsiteEventGroup, WebsiteTransaction } from '../../entities';

import {
  BUSINESS_PROFILES,
  CORE_MODULE_KEYS,
  LEGACY_BUSINESS_PROFILE,
  MODULE_REGISTRY,
  effectiveModules,
  enabledDependentsOf,
  getBusinessProfile,
  getModuleDefinition,
  isBusinessProfileId,
  isModuleChangeError,
  moduleLabel,
  planModuleChange,
  profilePresetModules,
  resolveModules,
  type BusinessProfileDefinition,
  type BusinessProfileId,
  type ModuleKey,
} from './business-profile.registry';
import type { BusinessProfilesResponseDto, BusinessProfileWaitlistResponseDto } from './dto/business-profile.dto';
import type {
  UpdateWebsiteBusinessProfileDto,
  UpdateWebsiteModulesDto,
  WebsiteModulesResponseDto,
  WebsiteModuleStateDto,
} from './dto/website-modules.dto';

/**
 * Status `website_transactions.status` yang dianggap "transaksi berjalan" →
 * modul `orders` tidak boleh dimatikan. Vocabulary = EscrowStatus
 * payment-service + CANCELLED (lihat WebsiteTransaction):
 * - PENDING_PAYMENT: pembeli belum/sedang membayar
 * - HELD: dana ditahan escrow, pesanan sedang dikerjakan
 * - DISPUTED: sengketa terbuka
 * Final (tidak memblokir): COMPLETED, REFUNDED, CLOSED, CANCELLED.
 * Sama dengan SYNCABLE_STATUSES di TransactionsService.
 */
export const RUNNING_TRANSACTION_STATUSES = ['PENDING_PAYMENT', 'HELD', 'DISPUTED'] as const;

/**
 * Status `website_event_groups.status` yang dianggap "gathering berjalan" →
 * modul `events` tidak boleh dimatikan:
 * - RSVP_OPEN: undangan/RSVP dibuka
 * - PAYMENT_OPEN: peserta sedang membayar
 * - CONFIRMED: acara terkonfirmasi, dana DP sudah cair
 * - IN_PROGRESS: hari-H / check-in berjalan
 * Tidak memblokir: PREORDER (rencana masih di keranjang pembeli, belum
 * diajukan), COMPLETED, CANCELLED.
 */
export const RUNNING_GATHERING_STATUSES = ['RSVP_OPEN', 'PAYMENT_OPEN', 'CONFIRMED', 'IN_PROGRESS'] as const;

const CORE_BLOCKED_REASON = 'Modul inti selalu aktif.';

/**
 * Validasi profile untuk create website / ganti profile: dikenal, bukan
 * `legacy`, dan berstatus `available`. Mengembalikan definisinya.
 */
export function assertSelectableProfile(profileId: string): BusinessProfileDefinition {
  if (!isBusinessProfileId(profileId) || profileId === LEGACY_BUSINESS_PROFILE) {
    throw new BadRequestException(`Business profile "${profileId}" tidak dikenal`);
  }
  const profile = getBusinessProfile(profileId);
  if (profile.status !== 'available') {
    throw new BadRequestException(`Jenis bisnis "${profile.label}" segera hadir dan belum bisa dipilih`);
  }
  return profile;
}

@Injectable()
export class WebsiteModulesService {
  constructor(
    @InjectRepository(Website)
    private readonly websiteRepo: Repository<Website>,
    @InjectRepository(WebsiteTransaction)
    private readonly transactionRepo: Repository<WebsiteTransaction>,
    @InjectRepository(WebsiteEventGroup)
    private readonly eventGroupRepo: Repository<WebsiteEventGroup>,
    @InjectRepository(BusinessProfileWaitlist)
    private readonly waitlistRepo: Repository<BusinessProfileWaitlist>,
  ) {}

  listBusinessProfiles(): BusinessProfilesResponseDto {
    return {
      profiles: BUSINESS_PROFILES.filter((p) => p.id !== LEGACY_BUSINESS_PROFILE)
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((p) => ({
          id: p.id,
          label: p.label,
          examples: p.examples,
          icon: p.icon,
          status: p.status,
          defaultModules: resolveModules(p.defaultModules, { includeComingSoon: true }),
          sortOrder: p.sortOrder,
        })),
      modules: MODULE_REGISTRY.map((m) => ({
        key: m.key,
        label: m.label,
        description: m.description,
        core: m.core,
        dependsOn: [...m.dependsOn],
        status: m.status,
        ownerOnly: m.ownerOnly,
      })),
    };
  }

  async registerWaitlist(userId: string, profileId: string): Promise<BusinessProfileWaitlistResponseDto> {
    if (!isBusinessProfileId(profileId) || profileId === LEGACY_BUSINESS_PROFILE) {
      throw new NotFoundException(`Business profile "${profileId}" tidak dikenal`);
    }
    const profile = getBusinessProfile(profileId);
    if (profile.status !== 'coming_soon') {
      throw new BadRequestException(`"${profile.label}" sudah tersedia; daftar minat hanya untuk jenis bisnis yang segera hadir`);
    }
    await this.waitlistRepo
      .createQueryBuilder()
      .insert()
      .into(BusinessProfileWaitlist)
      .values({ user_id: userId, business_profile: profileId })
      .orIgnore()
      .execute();
    return { registered: true };
  }

  async getModules(websiteId: string): Promise<WebsiteModulesResponseDto> {
    const website = await this.findWebsite(websiteId);
    return this.buildResponse(website);
  }

  async updateModules(websiteId: string, dto: UpdateWebsiteModulesDto): Promise<WebsiteModulesResponseDto> {
    const website = await this.findWebsite(websiteId);
    const plan = planModuleChange(effectiveModules(website), dto.enable ?? [], dto.disable ?? []);
    if (isModuleChangeError(plan)) {
      if (plan.kind === 'conflict') throw new ConflictException(plan.message);
      throw new BadRequestException(plan.message);
    }

    for (const key of plan.turnedOff) {
      const reason = await this.dataBlockedReason(websiteId, key);
      if (reason) {
        throw new ConflictException(`Modul "${moduleLabel(key)}" tidak bisa dimatikan: ${reason}`);
      }
    }

    // Pertama kali legacy di-PATCH: snapshot diisi dari himpunan efektif (plan.modules sudah berbasis itu).
    website.enabled_modules = plan.modules;
    await this.websiteRepo.save(website);
    return this.buildResponse(website);
  }

  async updateBusinessProfile(
    websiteId: string,
    dto: UpdateWebsiteBusinessProfileDto,
  ): Promise<WebsiteModulesResponseDto> {
    const website = await this.findWebsite(websiteId);
    const profile = assertSelectableProfile(dto.businessProfile);

    // Bekukan himpunan efektif dulu (penting untuk legacy kosong → semua available),
    // supaya ganti profile tanpa preset tidak menyembunyikan menu.
    const current = effectiveModules(website);
    let next = current;
    if (dto.resetFeaturesToPreset) {
      const preset = profilePresetModules(profile.id);
      const disable = current.filter((key) => !preset.includes(key) && !CORE_MODULE_KEYS.includes(key));
      const plan = planModuleChange(current, preset, disable);
      if (isModuleChangeError(plan)) {
        if (plan.kind === 'conflict') throw new ConflictException(plan.message);
        throw new BadRequestException(plan.message);
      }

      for (const key of plan.turnedOff) {
        const reason = await this.dataBlockedReason(websiteId, key);
        if (reason) {
          throw new ConflictException(`Modul "${moduleLabel(key)}" tidak bisa direset: ${reason}`);
        }
      }
      next = plan.modules;
    } else if (dto.applyPreset) {
      next = resolveModules([...current, ...profilePresetModules(profile.id)]);
    }

    website.business_profile = profile.id;
    website.enabled_modules = next;
    await this.websiteRepo.save(website);
    return this.buildResponse(website);
  }

  /**
   * Alasan modul tidak bisa dimatikan (null = boleh), termasuk aturan registry
   * (inti, dependensi) dan cek data. `enabled` = himpunan efektif saat ini.
   */
  async canDisable(websiteId: string, key: ModuleKey, enabled: readonly ModuleKey[]): Promise<string | null> {
    if (getModuleDefinition(key).core) return CORE_BLOCKED_REASON;
    const dependents = enabledDependentsOf(key, enabled);
    if (dependents.length) {
      return `Masih dipakai oleh modul aktif: ${dependents.map(moduleLabel).join(', ')}.`;
    }
    return this.dataBlockedReason(websiteId, key);
  }

  /** Cek berbasis data: masih ada data berjalan yang butuh menu modul ini. */
  private async dataBlockedReason(websiteId: string, key: ModuleKey): Promise<string | null> {
    if (key === 'orders') {
      const count = await this.transactionRepo.count({
        where: { website_id: websiteId, status: In([...RUNNING_TRANSACTION_STATUSES]) },
      });
      if (count > 0) {
        return `Masih ada ${count} transaksi berjalan (menunggu pembayaran, dana ditahan, atau sengketa).`;
      }
    }
    if (key === 'events') {
      const count = await this.eventGroupRepo.count({
        where: { website_id: websiteId, status: In([...RUNNING_GATHERING_STATUSES]) },
      });
      if (count > 0) {
        return `Masih ada ${count} gathering berjalan (RSVP, pembayaran, terkonfirmasi, atau sedang berlangsung).`;
      }
    }
    return null;
  }

  private async findWebsite(websiteId: string): Promise<Website> {
    const website = await this.websiteRepo.findOne({ where: { id: websiteId } });
    if (!website) throw new NotFoundException('Website not found');
    return website;
  }

  private async buildResponse(website: Website): Promise<WebsiteModulesResponseDto> {
    const enabled = effectiveModules(website);
    const modules: WebsiteModuleStateDto[] = [];
    for (const def of MODULE_REGISTRY) {
      const isEnabled = enabled.includes(def.key);
      modules.push({
        key: def.key,
        enabled: isEnabled,
        core: def.core,
        status: def.status,
        dependsOn: [...def.dependsOn],
        blockedReason: isEnabled ? await this.canDisable(website.id, def.key, enabled) : null,
      });
    }
    const businessProfile: BusinessProfileId = isBusinessProfileId(website.business_profile)
      ? website.business_profile
      : LEGACY_BUSINESS_PROFILE;
    return { businessProfile, enabledModules: enabled, modules };
  }
}
