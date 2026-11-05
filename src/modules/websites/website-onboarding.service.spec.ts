import { ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { IsNull, Repository } from 'typeorm';

import { JwtAuthGuard, ROLES_KEY, TenantStaffGuard } from '../../common/auth';
import { TenantStaff, Website } from '../../entities';

import {
  ONBOARDING_SIGNALS_SQL,
  OnboardingSignalsRow,
  WebsiteOnboardingService,
  toOnboardingStatus,
} from './website-onboarding.service';
import { WebsitesController } from './websites.controller';

const ALL_FALSE: OnboardingSignalsRow = {
  home_edited: false,
  has_own_product: false,
  seed_product_count: 0,
  primary_location_complete: false,
  has_flow: false,
  has_gathering: false,
  team_count: 1,
};

describe('toOnboardingStatus', () => {
  const website = { logo_url: null, link_shared_at: null };

  it('maps an empty website to all-false flags', () => {
    expect(toOnboardingStatus(website, ALL_FALSE)).toEqual({
      hasLogo: false,
      homeEdited: false,
      hasOwnProduct: false,
      seedProductCount: 0,
      primaryLocationComplete: false,
      hasFlow: false,
      hasGathering: false,
      teamCount: 1,
      linkSharedAt: null,
    });
  });

  it('maps every flag to true and coerces pg COUNT strings to numbers', () => {
    const sharedAt = new Date('2026-11-05T08:15:30.000Z');
    expect(
      toOnboardingStatus(
        { logo_url: 'https://cdn/logo.png', link_shared_at: sharedAt },
        {
          home_edited: true,
          has_own_product: true,
          seed_product_count: '4',
          primary_location_complete: true,
          has_flow: true,
          has_gathering: true,
          team_count: '3',
        },
      ),
    ).toEqual({
      hasLogo: true,
      homeEdited: true,
      hasOwnProduct: true,
      seedProductCount: 4,
      primaryLocationComplete: true,
      hasFlow: true,
      hasGathering: true,
      teamCount: 3,
      linkSharedAt: '2026-11-05T08:15:30.000Z',
    });
  });

  it('treats a blank logo_url as no logo', () => {
    expect(toOnboardingStatus({ logo_url: '   ', link_shared_at: null }, ALL_FALSE).hasLogo).toBe(false);
  });

  it('only seed products: hasOwnProduct false while seedProductCount reports them', () => {
    const res = toOnboardingStatus(website, { ...ALL_FALSE, seed_product_count: 6 });
    expect(res.hasOwnProduct).toBe(false);
    expect(res.seedProductCount).toBe(6);
  });

  it('own product next to seeds: hasOwnProduct true', () => {
    const res = toOnboardingStatus(website, { ...ALL_FALSE, has_own_product: true, seed_product_count: 6 });
    expect(res.hasOwnProduct).toBe(true);
  });

  it('missing row (defensive) yields all-false flags and zero counts', () => {
    expect(toOnboardingStatus(website, undefined)).toMatchObject({ homeEdited: false, seedProductCount: 0, teamCount: 0 });
  });
});

describe('ONBOARDING_SIGNALS_SQL', () => {
  const sql = ONBOARDING_SIGNALS_SQL.replace(/\s+/g, ' ');

  it('detects home edits through the section seed marker on the home page', () => {
    expect(sql).toContain('s.is_seed = FALSE');
    expect(sql).toContain("(p.is_home = TRUE OR p.slug = 'home')");
  });

  it('splits seed vs own products on metadata.is_seed', () => {
    expect(sql).toContain("COALESCE(wp.metadata->>'is_seed', 'false') <> 'true'");
    expect(sql).toContain("wp.metadata->>'is_seed' = 'true'");
  });

  it('counts only active staff and requires address + city on the primary location', () => {
    expect(sql).toContain('t.is_active = TRUE');
    expect(sql).toContain('l.is_primary = TRUE');
    expect(sql).toContain("NULLIF(TRIM(l.address_line), '') IS NOT NULL");
    expect(sql).toContain("NULLIF(TRIM(l.city), '') IS NOT NULL");
  });

  it('never loads lists: aggregates only, no JOIN', () => {
    expect(sql).not.toMatch(/\bJOIN\b/i);
  });
});

describe('WebsiteOnboardingService', () => {
  let service: WebsiteOnboardingService;
  let websiteRepo: { findOne: jest.Mock; query: jest.Mock; update: jest.Mock };

  beforeEach(() => {
    websiteRepo = { findOne: jest.fn(), query: jest.fn().mockResolvedValue([ALL_FALSE]), update: jest.fn() };
    service = new WebsiteOnboardingService(websiteRepo as unknown as Repository<Website>);
  });

  describe('getStatus', () => {
    it('loads the website columns and runs the signal query once', async () => {
      websiteRepo.findOne.mockResolvedValue({ id: 'w1', logo_url: 'x.png', link_shared_at: null });
      websiteRepo.query.mockResolvedValue([{ ...ALL_FALSE, home_edited: true }]);

      const res = await service.getStatus('w1');

      expect(res).toMatchObject({ hasLogo: true, homeEdited: true, linkSharedAt: null });
      expect(websiteRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'w1' },
        select: { id: true, logo_url: true, link_shared_at: true },
      });
      expect(websiteRepo.query).toHaveBeenCalledTimes(1);
      expect(websiteRepo.query).toHaveBeenCalledWith(ONBOARDING_SIGNALS_SQL, ['w1']);
    });

    it('404 when the website does not exist (no signal query)', async () => {
      websiteRepo.findOne.mockResolvedValue(null);
      await expect(service.getStatus('nope')).rejects.toBeInstanceOf(NotFoundException);
      expect(websiteRepo.query).not.toHaveBeenCalled();
    });
  });

  describe('markLinkShared', () => {
    it('sets the timestamp only when still null, guarded by IS NULL', async () => {
      const savedAt = new Date('2026-11-05T09:00:00.000Z');
      websiteRepo.findOne
        .mockResolvedValueOnce({ id: 'w1', logo_url: null, link_shared_at: null })
        .mockResolvedValueOnce({ id: 'w1', logo_url: null, link_shared_at: savedAt });

      await expect(service.markLinkShared('w1')).resolves.toEqual({ linkSharedAt: savedAt.toISOString() });
      expect(websiteRepo.update).toHaveBeenCalledWith(
        { id: 'w1', link_shared_at: IsNull() },
        { link_shared_at: expect.any(Date) },
      );
    });

    it('is idempotent: an existing timestamp is returned unchanged without writing', async () => {
      const first = new Date('2026-11-01T01:02:03.000Z');
      websiteRepo.findOne.mockResolvedValue({ id: 'w1', logo_url: null, link_shared_at: first });

      await expect(service.markLinkShared('w1')).resolves.toEqual({ linkSharedAt: first.toISOString() });
      await expect(service.markLinkShared('w1')).resolves.toEqual({ linkSharedAt: first.toISOString() });
      expect(websiteRepo.update).not.toHaveBeenCalled();
    });

    it('404 when the website does not exist', async () => {
      websiteRepo.findOne.mockResolvedValue(null);
      await expect(service.markLinkShared('nope')).rejects.toBeInstanceOf(NotFoundException);
      expect(websiteRepo.update).not.toHaveBeenCalled();
    });
  });
});

describe('onboarding-status access control', () => {
  const handlers = [
    WebsitesController.prototype.getOnboardingStatus,
    WebsitesController.prototype.markLinkShared,
  ];

  it('both endpoints require JWT + active website membership, with no extra role', () => {
    for (const handler of handlers) {
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([JwtAuthGuard, TenantStaffGuard]);
      expect(Reflect.getMetadata(ROLES_KEY, handler)).toBeUndefined();
    }
  });

  describe('TenantStaffGuard', () => {
    const contextFor = (request: Record<string, unknown>): ExecutionContext =>
      ({ switchToHttp: () => ({ getRequest: () => request }) }) as unknown as ExecutionContext;

    it('forbids a user who is not an active member of the website', async () => {
      const staffRepo = { findOne: jest.fn().mockResolvedValue(null) };
      const guard = new TenantStaffGuard(staffRepo as unknown as Repository<TenantStaff>);
      const request = { user: { userId: 'stranger' }, params: { websiteId: 'w1' }, headers: {} };

      await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(ForbiddenException);
      expect(staffRepo.findOne).toHaveBeenCalledWith({
        where: { website_id: 'w1', user_id: 'stranger', is_active: true },
      });
    });

    it('allows any active member (viewer included)', async () => {
      const staff = { website_id: 'w1', user_id: 'u1', role: 'viewer', is_active: true };
      const guard = new TenantStaffGuard({ findOne: jest.fn().mockResolvedValue(staff) } as unknown as Repository<TenantStaff>);
      const request: Record<string, unknown> = { user: { userId: 'u1' }, params: { websiteId: 'w1' }, headers: {} };

      await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
      expect(request.tenantStaff).toBe(staff);
    });
  });
});
