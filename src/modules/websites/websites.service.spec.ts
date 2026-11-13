import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Repository } from 'typeorm';

import { TenantStaff, Website, WebsitePlatformTemplateSubmission, WebsiteTemplate } from '../../entities';
import { PlanLimitService } from '../subscriptions/plan-limit.service';
import { BUILTIN_TEMPLATE_MANIFESTS } from '../templates/template-manifest';

import { profilePresetModules } from './business-profile.registry';
import { WebsiteBootstrapService } from './website-bootstrap.service';
import { WebsiteTemplateVersionService } from './website-template-version.service';
import { WebsitesService } from './websites.service';

/** Pin palsu: template package → versi published terbaru `1.2.3`; bawaan → tanpa pin. */
const versionServiceMock = () => ({
  resolveInstallPin: jest.fn(async (template: Partial<WebsiteTemplate>) =>
    template.source === 'package'
      ? { template_version_id: 'version-latest', template_runtime_version: '1.2.3' }
      : { template_version_id: null, template_runtime_version: null }),
});

describe('WebsitesService slug availability', () => {
  let service: WebsitesService;
  let websiteRepo: jest.Mocked<Pick<Repository<Website>, 'exist'>>;

  beforeEach(() => {
    websiteRepo = { exist: jest.fn() };
    service = new WebsitesService(
      websiteRepo as unknown as Repository<Website>,
      {} as Repository<TenantStaff>,
      {} as Repository<WebsiteTemplate>,
      {} as Repository<WebsitePlatformTemplateSubmission>,
      {} as WebsiteBootstrapService,
      {} as PlanLimitService,
      versionServiceMock() as unknown as WebsiteTemplateVersionService,
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
  let templateRepo: { findOne: jest.Mock };
  let submissionRepo: { findOne: jest.Mock };
  let staffRepo: { count: jest.Mock; create: jest.Mock; save: jest.Mock };
  let bootstrap: { bootstrap: jest.Mock };
  let planLimit: { checkCanCreateWebsite: jest.Mock };

  beforeEach(() => {
    websiteRepo = {
      findOne: jest.fn().mockResolvedValueOnce(null).mockResolvedValue({ id: 'w1' }),
      create: jest.fn((input: Partial<Website>) => input),
      save: jest.fn(async (input: Partial<Website>) => ({ ...input, id: 'w1' })),
    };
    templateRepo = { findOne: jest.fn() };
    submissionRepo = { findOne: jest.fn() };
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
      templateRepo as unknown as Repository<WebsiteTemplate>,
      submissionRepo as unknown as Repository<WebsitePlatformTemplateSubmission>,
      bootstrap as unknown as WebsiteBootstrapService,
      planLimit as unknown as PlanLimitService,
      versionServiceMock() as unknown as WebsiteTemplateVersionService,
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

  it('rejects an active template that is not supported by the renderer, even when a theme is supplied', async () => {
    templateRepo.findOne.mockResolvedValue({
      id: 'unbuilt-id',
      slug: 'unbuilt-template',
      is_active: true,
      manifest: null,
      structure: {},
    });

    await expect(
      service.create('u1', { name: 'Toko', slug: 'toko', template_id: 'unbuilt-id', theme: {} }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(websiteRepo.create).not.toHaveBeenCalled();
    expect(bootstrap.bootstrap).not.toHaveBeenCalled();
  });

  it('pins a selected designer template to its latest published version', async () => {
    templateRepo.findOne.mockResolvedValue({
      id: 'external-template-id',
      slug: 'storefront-demo',
      source: 'package',
      is_active: true,
      manifest: {
        slug: 'storefront-demo',
        name: 'Storefront Demo',
        version: '1.2.3',
        rendererApiVersion: 1,
        isBuiltin: false,
        businessProfiles: ['online_store'],
        capabilities: ['catalog'],
        sections: ['hero'],
      },
      structure: {},
    });

    await service.create('u1', {
      name: 'Toko',
      slug: 'toko',
      business_profile: 'online_store',
      template_id: 'external-template-id',
    });

    expect(websiteRepo.create.mock.calls[0][0]).toMatchObject({
      template_id: 'external-template-id',
      template_version_id: 'version-latest',
      template_runtime_version: '1.2.3',
    });
  });

  it('creates a website with sample data from the selected candidate manifest', async () => {
    templateRepo.findOne.mockResolvedValue({
      id: 'external-template-id',
      slug: 'kumpul',
      source: 'package',
      is_active: true,
      manifest: {
        slug: 'kumpul',
        name: 'Kumpul',
        version: '1.1.0',
        rendererApiVersion: 1,
        isBuiltin: false,
        businessProfiles: ['gathering'],
        capabilities: ['catalog', 'gathering'],
        sections: ['hero'],
      },
      structure: { sections: [] },
    });
    submissionRepo.findOne.mockResolvedValue({
      id: 'candidate-1',
      designer_user_id: 'u1',
      reviewer_user_id: 'reviewer-1',
      status: 'in_review',
      slug: 'kumpul',
      candidate_digest: 'a'.repeat(64),
      manifest: {
        manifestVersion: 1,
        slug: 'kumpul',
        name: 'Kumpul',
        version: '1.2.0',
        rendererApiVersion: 1,
        businessProfiles: ['gathering'],
        capabilities: ['catalog', 'gathering'],
        sections: ['hero'],
        defaultPages: [],
        sampleData: {
          categories: [{ label: 'Family' }],
          products: [
            {
              name: 'Family Camp',
              type: 'gathering',
              price: 350000,
              minAttendees: 4,
              maxAttendees: 40,
            },
          ],
          faqs: [{ question: 'Pertanyaan?', answer: 'Jawaban.' }],
        },
      },
    });

    await service.create('u1', {
      name: 'Website Uji',
      slug: 'website-uji',
      business_profile: 'gathering',
      template_id: 'external-template-id',
      template_trial_submission_id: 'candidate-1',
    });

    expect(websiteRepo.create.mock.calls[0][0]).toMatchObject({
      template_id: 'external-template-id',
      trial_submission_id: 'candidate-1',
    });
    expect(bootstrap.bootstrap).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'w1' }),
      'external-template-id',
      expect.objectContaining({
        master_defaults: expect.objectContaining({
          categories: [{ label: 'Family', images: [] }],
          gatherings: [{ name: 'Family Camp', price: 350000, min_attendees: 4, max_attendees: 40 }],
          faqs: [{ question: 'Pertanyaan?', answer: 'Jawaban.' }],
        }),
      }),
    );
  });

  it('rejects candidate website creation when the submission is not visible to the user', async () => {
    templateRepo.findOne.mockResolvedValue({
      id: 'external-template-id',
      slug: 'kumpul',
      source: 'package',
      is_active: true,
      manifest: {
        slug: 'kumpul',
        name: 'Kumpul',
        version: '1.1.0',
        rendererApiVersion: 1,
        isBuiltin: false,
        businessProfiles: ['gathering'],
        capabilities: ['catalog'],
        sections: ['hero'],
      },
      structure: {},
    });
    submissionRepo.findOne.mockResolvedValue({
      id: 'candidate-1',
      designer_user_id: 'another-user',
      reviewer_user_id: 'reviewer-1',
      status: 'in_review',
      slug: 'kumpul',
      candidate_digest: 'a'.repeat(64),
      manifest: {},
    });

    await expect(service.create('u1', {
      name: 'Website Uji',
      slug: 'website-uji',
      business_profile: 'gathering',
      template_id: 'external-template-id',
      template_trial_submission_id: 'candidate-1',
    })).rejects.toBeInstanceOf(ForbiddenException);
    expect(websiteRepo.create).not.toHaveBeenCalled();
  });
});

describe('WebsitesService.update identity owner-only', () => {
  let service: WebsitesService;
  let websiteRepo: { findOne: jest.Mock; save: jest.Mock };
  let templateRepo: { findOne: jest.Mock };
  let versionService: ReturnType<typeof versionServiceMock>;

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
    templateRepo = { findOne: jest.fn() };
    versionService = versionServiceMock();
    service = new WebsitesService(
      websiteRepo as unknown as Repository<Website>,
      {} as Repository<TenantStaff>,
      templateRepo as unknown as Repository<WebsiteTemplate>,
      {} as Repository<WebsitePlatformTemplateSubmission>,
      {} as WebsiteBootstrapService,
      {} as PlanLimitService,
      versionService as unknown as WebsiteTemplateVersionService,
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

  it('rejects selecting an active template that is not supported by the renderer', async () => {
    templateRepo.findOne.mockResolvedValue({
      id: 'unbuilt-id',
      slug: 'unbuilt-template',
      is_active: true,
      manifest: null,
    });

    await expect(service.update('w1', { template_id: 'unbuilt-id' }, 'owner')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(websiteRepo.save).not.toHaveBeenCalled();
  });

  it('clears a pinned runtime version when changing the selected template', async () => {
    const website = { ...current(), template_id: 'old-template', template_runtime_version: '1.0.0' };
    websiteRepo.findOne.mockResolvedValue(website);
    const template = {
      id: 'new-template',
      slug: 'barber-classic',
      is_active: true,
      manifest: BUILTIN_TEMPLATE_MANIFESTS[0],
    };
    templateRepo.findOne.mockResolvedValue(template);

    await service.update('w1', { template_id: 'new-template' }, 'owner');

    expect(website.template_runtime_version).toBeNull();
    expect(websiteRepo.save).toHaveBeenCalledWith(website);
  });

  it('does not bump the pinned version when the same template is saved again (G5)', async () => {
    const website = {
      ...current(),
      template_id: 'external-template',
      template_version_id: 'version-old',
      template_runtime_version: '1.0.0',
    };
    websiteRepo.findOne.mockResolvedValue(website);

    await service.update('w1', { template_id: 'external-template', tagline: '' }, 'owner');

    expect(templateRepo.findOne).not.toHaveBeenCalled();
    expect(versionService.resolveInstallPin).not.toHaveBeenCalled();
    expect(website).toMatchObject({ template_version_id: 'version-old', template_runtime_version: '1.0.0' });
  });

  it('pins the latest published version when switching to a designer template', async () => {
    const website = { ...current(), template_id: 'old-template', template_runtime_version: null };
    websiteRepo.findOne.mockResolvedValue(website);
    templateRepo.findOne.mockResolvedValue({
      id: 'external-template',
      slug: 'storefront-demo',
      source: 'package',
      is_active: true,
      manifest: {
        slug: 'storefront-demo',
        name: 'Storefront Demo',
        version: '1.2.3',
        rendererApiVersion: 1,
        isBuiltin: false,
        businessProfiles: ['online_store'],
        capabilities: ['catalog'],
        sections: ['hero'],
      },
    });

    await service.update('w1', { template_id: 'external-template' }, 'owner');

    expect(website).toMatchObject({
      template_id: 'external-template',
      template_version_id: 'version-latest',
      template_runtime_version: '1.2.3',
    });
  });
});
