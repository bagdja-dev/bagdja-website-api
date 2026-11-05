import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { Website } from '../../entities';

import type { WebsiteOnboardingLinkSharedResponseDto, WebsiteOnboardingStatusDto } from './dto/website-onboarding.dto';

/** Baris hasil `ONBOARDING_SIGNALS_SQL` (COUNT bisa datang sebagai string dari driver pg). */
export interface OnboardingSignalsRow {
  home_edited: boolean;
  has_own_product: boolean;
  seed_product_count: number | string;
  primary_location_complete: boolean;
  has_flow: boolean;
  has_gathering: boolean;
  team_count: number | string;
}

/**
 * Semua sinyal checklist dalam SATU round-trip: tiap kolom adalah subquery
 * EXISTS/COUNT ber-index `website_id` (tanpa JOIN, tanpa memuat list).
 * `$1` = website id.
 */
export const ONBOARDING_SIGNALS_SQL = `
SELECT
  EXISTS (
    SELECT 1 FROM website_sections s
    WHERE s.is_seed = FALSE
      AND s.page_id IN (
        SELECT p.id FROM website_pages p
        WHERE p.website_id = $1 AND (p.is_home = TRUE OR p.slug = 'home')
      )
  ) AS home_edited,
  EXISTS (
    SELECT 1 FROM website_products wp
    WHERE wp.website_id = $1 AND COALESCE(wp.metadata->>'is_seed', 'false') <> 'true'
  ) AS has_own_product,
  (
    SELECT COUNT(*)::int FROM website_products wp
    WHERE wp.website_id = $1 AND wp.metadata->>'is_seed' = 'true'
  ) AS seed_product_count,
  EXISTS (
    SELECT 1 FROM website_locations l
    WHERE l.website_id = $1
      AND l.is_primary = TRUE
      AND NULLIF(TRIM(l.address_line), '') IS NOT NULL
      AND NULLIF(TRIM(l.city), '') IS NOT NULL
  ) AS primary_location_complete,
  EXISTS (SELECT 1 FROM fulfillment_flows f WHERE f.website_id = $1) AS has_flow,
  EXISTS (
    SELECT 1 FROM website_products g WHERE g.website_id = $1 AND g.type = 'gathering'
  ) AS has_gathering,
  (
    SELECT COUNT(*)::int FROM tenant_staff t WHERE t.website_id = $1 AND t.is_active = TRUE
  ) AS team_count
`;

type WebsiteOnboardingFields = Pick<Website, 'logo_url' | 'link_shared_at'>;

/** Gabungkan kolom website + baris sinyal menjadi DTO respons. */
export function toOnboardingStatus(
  website: WebsiteOnboardingFields,
  row: OnboardingSignalsRow | undefined,
): WebsiteOnboardingStatusDto {
  return {
    hasLogo: Boolean(website.logo_url?.trim()),
    homeEdited: row?.home_edited === true,
    hasOwnProduct: row?.has_own_product === true,
    seedProductCount: Number(row?.seed_product_count ?? 0),
    primaryLocationComplete: row?.primary_location_complete === true,
    hasFlow: row?.has_flow === true,
    hasGathering: row?.has_gathering === true,
    teamCount: Number(row?.team_count ?? 0),
    linkSharedAt: website.link_shared_at ? new Date(website.link_shared_at).toISOString() : null,
  };
}

/** Status checklist "Siapkan website kamu" (Studio Beranda, template-contract.md §1.3). */
@Injectable()
export class WebsiteOnboardingService {
  constructor(
    @InjectRepository(Website)
    private readonly websiteRepo: Repository<Website>,
  ) {}

  async getStatus(websiteId: string): Promise<WebsiteOnboardingStatusDto> {
    const website = await this.findWebsite(websiteId);
    const rows: OnboardingSignalsRow[] = await this.websiteRepo.query(ONBOARDING_SIGNALS_SQL, [websiteId]);
    return toOnboardingStatus(website, rows[0]);
  }

  /** Idempotent: hanya mengisi `link_shared_at` bila masih NULL; selalu mengembalikan nilai tersimpan. */
  async markLinkShared(websiteId: string): Promise<WebsiteOnboardingLinkSharedResponseDto> {
    const website = await this.findWebsite(websiteId);
    if (website.link_shared_at) {
      return { linkSharedAt: new Date(website.link_shared_at).toISOString() };
    }
    // Guard `IS NULL` di WHERE → aman bila dua request datang bersamaan.
    await this.websiteRepo.update({ id: websiteId, link_shared_at: IsNull() }, { link_shared_at: new Date() });
    const saved = await this.findWebsite(websiteId);
    return { linkSharedAt: new Date(saved.link_shared_at ?? Date.now()).toISOString() };
  }

  private async findWebsite(websiteId: string): Promise<Website> {
    const website = await this.websiteRepo.findOne({
      where: { id: websiteId },
      select: { id: true, logo_url: true, link_shared_at: true },
    });
    if (!website) throw new NotFoundException('Website not found');
    return website;
  }
}
