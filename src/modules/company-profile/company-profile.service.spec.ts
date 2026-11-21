import { BadRequestException, NotFoundException } from '@nestjs/common';

import { CompanyProfileService } from './company-profile.service';

function repositoryMock(overrides: Record<string, unknown> = {}) {
  return { findOne: jest.fn().mockResolvedValue(null), find: jest.fn().mockResolvedValue([]), create: jest.fn((value) => value), save: jest.fn(async (value) => ({ id: 'row-1', ...value })), remove: jest.fn(async (value) => value), delete: jest.fn(async () => ({ affected: 1 })), update: jest.fn(async () => ({ affected: 1 })), ...overrides };
}

function createService() {
  const websiteRepo = repositoryMock({ findOne: jest.fn().mockResolvedValue({ id: 'site-1', slug: 'agency', is_active: true }) });
  const languageRepo = repositoryMock({ findOne: jest.fn().mockResolvedValue({ id: 'lang-1', website_id: 'site-1', locale: 'id', label: 'Indonesia', is_default: true, is_active: true, sort_order: 0 }) });
  const partnerRepo = repositoryMock();
  const partnerTranslationRepo = repositoryMock();
  const partnerCategoryRepo = repositoryMock();
  const partnerCategoryAssignmentRepo = repositoryMock();
  const partnerAccountRepo = repositoryMock();
  const locationRepo = repositoryMock();
  const partnerLocationRepo = repositoryMock();
  const portfolioRepo = repositoryMock();
  const portfolioTranslationRepo = repositoryMock();
  const portfolioCategoryRepo = repositoryMock();
  const portfolioCategoryTranslationRepo = repositoryMock();
  const portfolioProjectCategoryRepo = repositoryMock();
  const service = new CompanyProfileService(
    websiteRepo as never,
    languageRepo as never,
    partnerRepo as never,
    partnerTranslationRepo as never,
    partnerCategoryRepo as never,
    partnerCategoryAssignmentRepo as never,
    partnerAccountRepo as never,
    locationRepo as never,
    partnerLocationRepo as never,
    portfolioRepo as never,
    portfolioTranslationRepo as never,
    portfolioCategoryRepo as never,
    portfolioCategoryTranslationRepo as never,
    portfolioProjectCategoryRepo as never,
  );
  return { service, websiteRepo, languageRepo, partnerRepo, partnerTranslationRepo, partnerCategoryRepo, partnerCategoryAssignmentRepo, partnerAccountRepo, locationRepo, partnerLocationRepo, portfolioRepo, portfolioTranslationRepo, portfolioCategoryRepo, portfolioCategoryTranslationRepo, portfolioProjectCategoryRepo };
}

describe('CompanyProfileService', () => {
  it('rejects javascript URLs for external clients', async () => {
    const { service } = createService();
    await expect(service.createClient('site-1', { website_url: 'javascript:alert(1)' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows http and https portfolio project URLs', async () => {
    const { service, portfolioRepo, portfolioTranslationRepo } = createService();
    portfolioRepo.findOne = jest.fn().mockResolvedValueOnce(null).mockResolvedValue({ id: 'project-1', website_id: 'site-1', slug: 'company-dashboard', tags: ['Branding'], is_published: true });
    portfolioRepo.save = jest.fn(async (value) => ({ id: 'project-1', ...value }));
    portfolioTranslationRepo.save = jest.fn(async (value) => ({ id: 'translation-1', ...value }));
    await expect(service.createPortfolioProject('site-1', {
      slug: 'company-dashboard',
      title: 'Company Dashboard',
      project_url: 'https://example.com/work',
      photos: [{ url: 'https://cdn.example.com/project.jpg', alt: 'Project', caption: 'Project photo' }],
      video_url: 'https://cdn.example.com/project.mp4',
      model3d_url: 'https://cdn.example.com/project.glb',
      excerpt: 'A project excerpt',
      detail: 'Project details',
      tags: ['Branding'],
    })).resolves.toMatchObject({ id: 'project-1', slug: 'company-dashboard' });
    expect(portfolioRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Company Dashboard',
      tags: ['Branding'],
      cover_image: 'https://cdn.example.com/project.jpg',
      photos: [{ url: 'https://cdn.example.com/project.jpg', alt: 'Project', caption: 'Project photo' }],
      video_url: 'https://cdn.example.com/project.mp4',
      model3d_url: 'https://cdn.example.com/project.glb',
    }));
    expect(portfolioTranslationRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      excerpt: 'A project excerpt',
      detail: '<p>Project details</p>',
      tags: ['Branding'],
      summary: 'A project excerpt',
      description: '<p>Project details</p>',
    }));
  });

  it('rejects more than four portfolio photos', async () => {
    const { service } = createService();
    const photos = Array.from({ length: 5 }, (_, index) => ({ url: `https://cdn.example.com/${index}.jpg` }));
    await expect(service.createPortfolioProject('site-1', { title: 'Project', photos })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects removing the default language', async () => {
    const { service } = createService();
    await expect(service.removeLanguage('site-1', 'id')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns no public portfolio project for an unknown website', async () => {
    const { service, websiteRepo } = createService();
    websiteRepo.findOne = jest.fn().mockResolvedValue(null);
    await expect(service.findPublicPortfolioProject('missing', 'project-a', 'id')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('resolves a localized portfolio slug and selects the Accept-Language translation', async () => {
    const { service, languageRepo, portfolioRepo, portfolioTranslationRepo } = createService();
    languageRepo.find = jest.fn().mockResolvedValue([
      { locale: 'id', is_default: true },
      { locale: 'en', is_default: false },
    ]);
    const englishTranslation = { project_id: 'project-1', locale: 'en', slug: 'visual-identity', is_published: true };
    const indonesianTranslation = { project_id: 'project-1', locale: 'id', slug: 'identitas-visual', is_published: true };
    portfolioTranslationRepo.find = jest.fn().mockImplementation(({ where }) => (
      where.slug
        ? [englishTranslation]
        : [englishTranslation, indonesianTranslation]
    ));
    portfolioRepo.findOne = jest.fn().mockResolvedValue({
      id: 'project-1',
      website_id: 'site-1',
      name: 'Brand refresh',
      is_published: true,
    });

    await expect(service.findPublicPortfolioProject(
      'agency',
      'visual-identity',
      undefined,
      'en-US,en;q=0.9,id;q=0.8',
    )).resolves.toMatchObject({
      id: 'project-1',
      translation: { locale: 'en', slug: 'visual-identity' },
    });
    expect(portfolioRepo.findOne).toHaveBeenCalledWith({
      where: { id: 'project-1', website_id: 'site-1', is_published: true },
    });
  });

  it('lets an explicit portfolio locale override Accept-Language', async () => {
    const { service, languageRepo, portfolioRepo, portfolioTranslationRepo } = createService();
    languageRepo.find = jest.fn().mockResolvedValue([
      { locale: 'id', is_default: true },
      { locale: 'en', is_default: false },
    ]);
    const englishTranslation = { project_id: 'project-1', locale: 'en', slug: 'visual-identity', is_published: true };
    const indonesianTranslation = { project_id: 'project-1', locale: 'id', slug: 'identitas-visual', is_published: true };
    portfolioTranslationRepo.find = jest.fn().mockImplementation(({ where }) => (
      where.slug
        ? [englishTranslation]
        : [englishTranslation, indonesianTranslation]
    ));
    portfolioRepo.findOne = jest.fn().mockResolvedValue({ id: 'project-1', website_id: 'site-1', is_published: true });

    await expect(service.findPublicPortfolioProject(
      'agency',
      'visual-identity',
      'id',
      'en',
    )).resolves.toMatchObject({
      translation: { locale: 'id', slug: 'identitas-visual' },
    });
  });

  it('updates the shared project name without replacing its master slug with a translated slug', async () => {
    const { service, portfolioRepo } = createService();
    portfolioRepo.findOne = jest.fn().mockResolvedValue({
      id: 'project-1',
      website_id: 'site-1',
      name: 'Old internal name',
      slug: 'default-slug',
      photos: [],
    });

    portfolioRepo.save = jest.fn(async (value) => value);

    await expect(service.updatePortfolioProject('site-1', 'project-1', {
      name: 'New internal name',
      slug: 'translated-slug',
    })).resolves.toMatchObject({
      name: 'New internal name',
      slug: 'default-slug',
    });
  });

  it('updates portfolio tags on the shared project and keeps legacy translation tags in sync', async () => {
    const { service, portfolioRepo, portfolioTranslationRepo } = createService();
    portfolioRepo.findOne = jest.fn().mockResolvedValue({
      id: 'project-1',
      website_id: 'site-1',
      name: 'Project',
      slug: 'project',
      tags: ['Old tag'],
      photos: [],
    });

    portfolioRepo.save = jest.fn(async (value) => value);

    await expect(service.updatePortfolioProject('site-1', 'project-1', {
      tags: [' Design ', 'design', 'Branding'],
    })).resolves.toMatchObject({
      tags: ['design', 'Branding'],
    });

    expect(portfolioTranslationRepo.update).toHaveBeenCalledWith(
      { project_id: 'project-1', website_id: 'site-1' },
      { tags: ['design', 'Branding'] },
    );
  });

  it('associates only same-website categories with a portfolio project', async () => {
    const { service, portfolioRepo, portfolioCategoryRepo, portfolioProjectCategoryRepo } = createService();
    const category = { id: 'category-1', website_id: 'site-1', slug: 'branding', name: 'Branding' };
    portfolioRepo.findOne = jest.fn().mockResolvedValue({
      id: 'project-1',
      website_id: 'site-1',
      name: 'Project',
      slug: 'project',
      photos: [],
    });
    portfolioRepo.save = jest.fn(async (value) => value);
    portfolioCategoryRepo.find = jest.fn().mockResolvedValue([category]);
    portfolioProjectCategoryRepo.find = jest.fn().mockResolvedValue([{ project_id: 'project-1', category_id: category.id }]);
    portfolioProjectCategoryRepo.save = jest.fn(async (value) => value);

    await expect(service.updatePortfolioProject('site-1', 'project-1', {
      category_ids: [category.id],
    })).resolves.toMatchObject({ category_ids: [category.id] });
    expect(portfolioProjectCategoryRepo.save).toHaveBeenCalledWith([
      { project_id: 'project-1', category_id: category.id, website_id: 'site-1' },
    ]);

    portfolioCategoryRepo.find = jest.fn().mockResolvedValue([]);
    await expect(service.updatePortfolioProject('site-1', 'project-1', {
      category_ids: ['other-site-category'],
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('keeps public portfolio category names stable while localizing descriptions', async () => {
    const {
      service,
      languageRepo,
      portfolioRepo,
      portfolioTranslationRepo,
      portfolioCategoryRepo,
      portfolioCategoryTranslationRepo,
      portfolioProjectCategoryRepo,
    } = createService();
    languageRepo.find = jest.fn().mockResolvedValue([{ locale: 'en', is_default: true }]);
    portfolioRepo.find = jest.fn().mockResolvedValue([{
      id: 'project-1',
      website_id: 'site-1',
      slug: 'project',
      client_id: null,
      is_published: true,
      tags: [],
    }]);
    portfolioTranslationRepo.find = jest.fn().mockResolvedValue([{
      project_id: 'project-1',
      locale: 'en',
      title: 'Project',
      slug: 'project',
      is_published: true,
      seo_no_index: false,
    }]);
    portfolioProjectCategoryRepo.find = jest.fn().mockResolvedValue([
      { project_id: 'project-1', category_id: 'public-category' },
      { project_id: 'project-1', category_id: 'private-category' },
    ]);
    portfolioCategoryRepo.find = jest.fn().mockResolvedValue([{
      id: 'public-category',
      slug: 'branding',
      name: 'Branding',
      is_public: true,
      is_active: true,
      sort_order: 0,
    }]);
    portfolioCategoryTranslationRepo.find = jest.fn().mockResolvedValue([{
      category_id: 'public-category',
      locale: 'en',
      name: 'Brand identity',
      description: 'Identity projects',
    }]);

    await expect(service.findPublicPortfolioProjects('agency', 'en')).resolves.toMatchObject([
      {
        id: 'project-1',
        categories: [{ id: 'public-category', name: 'Branding', description: 'Identity projects' }],
        client: null,
      },
    ]);
  });

  it('returns a stable category name and localized description from the public category list', async () => {
    const { service, languageRepo, portfolioCategoryRepo, portfolioCategoryTranslationRepo } = createService();
    languageRepo.find = jest.fn().mockResolvedValue([{ locale: 'en', is_default: true }]);
    portfolioCategoryRepo.find = jest.fn().mockResolvedValue([{
      id: 'category-1',
      slug: 'branding',
      name: 'Branding',
      description: 'Desain merek',
      is_public: true,
      is_active: true,
      sort_order: 0,
    }]);
    portfolioCategoryTranslationRepo.find = jest.fn().mockResolvedValue([{
      category_id: 'category-1',
      locale: 'en',
      name: 'Brand Identity',
      description: 'Brand design',
    }]);

    await expect(service.findPublicPortfolioCategories('agency', 'en')).resolves.toMatchObject([
      { id: 'category-1', name: 'Branding', description: 'Brand design' },
    ]);
  });

  it('creates one partner with both client and provider roles', async () => {
    const { service, partnerRepo } = createService();
    const partner = {
      id: 'partner-1',
      website_id: 'site-1',
      name: 'Studio Partner',
      is_client: true,
      is_provider: true,
      is_public: false,
      is_active: true,
      status: 'active',
      sort_order: 0,
    };
    partnerRepo.save = jest.fn().mockResolvedValue(partner);
    partnerRepo.find = jest.fn().mockResolvedValue([partner]);

    await expect(service.createPartner('site-1', {
      name: 'Studio Partner',
      is_client: true,
      is_provider: true,
    })).resolves.toMatchObject({ id: 'partner-1', is_client: true, is_provider: true });
    expect(partnerRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Studio Partner',
      is_client: true,
      is_provider: true,
    }));
  });

  it('does not allow a partner without a business role', async () => {
    const { service, partnerRepo } = createService();
    await expect(service.createPartner('site-1', {
      name: 'Roleless',
      is_client: false,
      is_provider: false,
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(partnerRepo.save).not.toHaveBeenCalled();
  });

  it('filters public client partners by a public category', async () => {
    const { service, languageRepo, partnerRepo, partnerTranslationRepo, partnerCategoryRepo, partnerCategoryAssignmentRepo } = createService();
    languageRepo.find = jest.fn().mockResolvedValue([{ locale: 'en', is_default: true }]);
    partnerRepo.find = jest.fn().mockResolvedValue([{
      id: 'partner-1',
      website_id: 'site-1',
      name: 'Public Partner',
      is_client: true,
      is_public: true,
      is_active: true,
    }]);
    partnerCategoryRepo.find = jest.fn().mockResolvedValue([{
      id: 'category-1',
      website_id: 'site-1',
      slug: 'featured',
      name: 'Featured',
      is_public: true,
      is_active: true,
    }]);
    partnerCategoryAssignmentRepo.find = jest.fn().mockResolvedValue([{ partner_id: 'partner-1', category_id: 'category-1' }]);
    partnerTranslationRepo.find = jest.fn().mockResolvedValue([{
      partner_id: 'partner-1',
      locale: 'en',
      name: 'Public Partner',
    }]);

    await expect(service.findPublicClients('agency', 'en', 'featured')).resolves.toMatchObject([
      { id: 'partner-1', translation: { locale: 'en' }, categories: [{ id: 'category-1', slug: 'featured', name: 'Featured' }] },
    ]);
  });

  it('keeps public clients visible when they have no translation so renderers can use the master name', async () => {
    const { service, languageRepo, partnerRepo, partnerTranslationRepo } = createService();
    languageRepo.find = jest.fn().mockResolvedValue([{ locale: 'en', is_default: true }]);
    partnerRepo.find = jest.fn().mockResolvedValue([{
      id: 'client-1',
      website_id: 'site-1',
      name: 'Client without translation',
      logo_url: 'https://example.com/client.png',
      is_client: true,
      is_public: true,
      is_active: true,
    }]);
    partnerTranslationRepo.find = jest.fn().mockResolvedValue([]);

    await expect(service.findPublicClients('agency', 'en')).resolves.toMatchObject([
      { id: 'client-1', name: 'Client without translation', translation: null },
    ]);
  });
});
