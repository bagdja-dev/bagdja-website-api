import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Repository } from 'typeorm';

import { TenantStaff, Website, WebsiteTemplate } from '../../entities';
import { PlanLimitService } from '../subscriptions/plan-limit.service';

import { profilePresetModules } from './business-profile.registry';
import { WebsiteBootstrapService } from './website-bootstrap.service';
import { WebsitesService } from './websites.service';

describe('WebsitesService slug availability', () => {
  let service: WebsitesService;
  let websiteRepo: jest.Mocked<Pick<Repository<Website>, 'exist'>>;

  beforeEach(() => {
    websiteRepo = { exist: jest.fn() };
    service = new WebsitesService(
      websiteRepo as unknown as Repository<Website>,
      {} as Repository<TenantStaff>,
      {} as Repository<WebsiteTemplate>,
      {} as WebsiteBootstrapService,
      {} as PlanLimitService,
    );
  });

  it('returns available when no website uses the slug', async () => {
    websiteRepo.exist.mockResolvedValue(false);

    await expect(service.checkSlugAvailability('my-store')).resolves.toEqual({
      slug: 'my-store',
      available: true,
    });
  });

  it('returns unavailable when the slug is already in use', async () => {
    websiteRepo.exist.mockResolvedValue(true);

    await expect(service.checkSlugAvailability('my-store')).resolves.toEqual({
      slug: 'my-store',
      available: false,
    });
  });
});

describe('WebsitesService.create with business profile', () => {
  let service: WebsitesService;
  let websiteRepo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let staffRepo: { count: jest.Mock; create: jest.Mock; save: jest.Mock };
  let bootstrap: { bootstrap: jest.Mock };
  let planLimit: { checkCanCreateWebsite: jest.Mock };

  beforeEach(() => {
    websiteRepo = {
      findOne: jest.fn().mockResolvedValueOnce(null).mockResolvedValue({ id: 'w1' }),
      create: jest.fn((input: Partial<Website>) => input),
      save: jest.fn(async (input: Partial<Website>) => ({ ...input, id: 'w1' })),
    };
    staffRepo = {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn((input: Partial<TenantStaff>) => input),
      save: jest.fn(async (input: Partial<TenantStaff>) => input),
    };
    bootstrap = { bootstrap: jest.fn().mockResolvedValue(undefined) };
    planLimit = { checkCanCreateWebsite: jest.fn().mockResolvedValue(undefined) };
    service = new WebsitesService(
      websiteRepo as unknown as Repository<Website>,
      staffRepo as unknown as Repository<TenantStaff>,
      {} as Repository<WebsiteTemplate>,
      bootstrap as unknown as WebsiteBootstrapService,
      planLimit as unknown as PlanLimitService,
    );
  });

  it('fills business_profile and resolved preset modules (available only)', async () => {
    await service.create('u1', { name: 'Toko', slug: 'toko', business_profile: 'service_business' });
    const created = websiteRepo.create.mock.calls[0][0] as Partial<Website>;
    expect(created.business_profile).toBe('service_business');
    expect(created.enabled_modules).toEqual(profilePresetModules('service_business'));
    expect(created.enabled_modules).not.toContain('appointments');
    expect(created.enabled_modules).toEqual(expect.arrayContaining(['site_content', 'wallet', 'catalog', 'orders']));
  });

  it('defaults to legacy with an empty snapshot when business_profile is omitted (old clients)', async () => {
    await service.create('u1', { name: 'Toko', slug: 'toko' });
    const created = websiteRepo.create.mock.calls[0][0] as Partial<Website>;
    expect(created.business_profile).toBe('legacy');
    expect(created.enabled_modules).toEqual([]);
  });

  it('rejects coming_soon profiles before touching the database', async () => {
    await expect(
      service.create('u1', { name: 'Toko', slug: 'toko', business_profile: 'place_rental' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(websiteRepo.create).not.toHaveBeenCalled();
    expect(planLimit.checkCanCreateWebsite).not.toHaveBeenCalled();
  });
});

describe('WebsitesService.update identity owner-only', () => {
  let service: WebsitesService;
  let websiteRepo: { findOne: jest.Mock; save: jest.Mock };

  const current = (): Partial<Website> => ({
    id: 'w1',
    name: 'Toko',
    slug: 'toko',
    tagline: null,
    logo_url: null,
    whatsapp: null,
    phone: null,
    email: null,
    social_links: {},
    domain: null,
  });

  beforeEach(() => {
    websiteRepo = {
      findOne: jest.fn().mockImplementation(async () => current()),
      save: jest.fn(async (input: Partial<Website>) => input),
    };
    service = new WebsitesService(
      websiteRepo as unknown as Repository<Website>,
      {} as Repository<TenantStaff>,
      {} as Repository<WebsiteTemplate>,
      {} as WebsiteBootstrapService,
      {} as PlanLimitService,
    );
  });

  it('allows the owner to change identity fields', async () => {
    const saved = await service.update('w1', { name: 'Toko Baru', tagline: 'Halo' }, 'owner');
    expect(saved).toMatchObject({ name: 'Toko Baru', tagline: 'Halo' });
  });

  it.each([
    ['name', { name: 'Lain' }],
    ['tagline', { tagline: 'Baru' }],
    ['logo_url', { logo_url: 'https://cdn/x.png' }],
    ['whatsapp', { whatsapp: '62811' }],
    ['phone', { phone: '0811' }],
    ['email', { email: 'a@b.co' }],
    ['social_links', { social_links: { instagram: 'toko' } }],
    ['opening_hours', { opening_hours: { note: 'Senin' } }],
  ])('forbids admin changing %s', async (_field, dto) => {
    await expect(service.update('w1', dto, 'admin')).rejects.toThrow(ForbiddenException);
    expect(websiteRepo.save).not.toHaveBeenCalled();
  });

  it('allows admin to change non-identity fields', async () => {
    const saved = await service.update('w1', { is_active: false }, 'admin');
    expect(saved).toMatchObject({ is_active: false });
  });

  it('does not treat unchanged identity values as a change for admin', async () => {
    await expect(
      service.update('w1', { name: 'Toko', tagline: '', social_links: {}, is_active: true }, 'admin'),
    ).resolves.toBeDefined();
  });
});
