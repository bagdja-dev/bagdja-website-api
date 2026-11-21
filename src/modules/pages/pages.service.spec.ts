import { NotFoundException } from '@nestjs/common';

import { PagesService } from './pages.service';

function repositoryMock(overrides: Record<string, unknown> = {}) {
  return {
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => ({ id: 'translation-1', ...value })),
    ...overrides,
  };
}

function createService() {
  const page = {
    id: 'page-1',
    website_id: 'site-1',
    name: 'about-page',
    title: 'Tentang Kami',
    slug: 'tentang-kami',
    content: {},
    seo_title: null,
    seo_description: null,
    seo_image: null,
    seo_no_index: false,
    external_url: null,
    sections: [],
  };
  const pageRepo = repositoryMock({ findOne: jest.fn().mockResolvedValue(page) });
  const pageTranslationRepo = repositoryMock();
  const languageRepo = repositoryMock({ findOne: jest.fn().mockResolvedValue({ locale: 'en', is_active: true }) });
  const staffRepo = repositoryMock();
  const service = new PagesService(
    pageRepo as never,
    pageTranslationRepo as never,
    languageRepo as never,
    staffRepo as never,
    {} as never,
  );
  return { service, page, pageRepo, pageTranslationRepo, languageRepo };
}

describe('PagesService page translations', () => {
  it('returns saved translation names with the page', async () => {
    const { service, pageTranslationRepo } = createService();
    pageTranslationRepo.find = jest.fn().mockResolvedValue([
      { locale: 'en', title: 'About Us', slug: 'tentang-kami' },
    ]);

    await expect(service.findOne('page-1')).resolves.toMatchObject({
      name: 'about-page',
      translations: [{ locale: 'en', title: 'About Us', slug: 'tentang-kami' }],
    });
  });

  it('updates the stable page name independently from localized titles', async () => {
    const { service, pageRepo } = createService();
    pageRepo.save = jest.fn(async (value) => value);

    await expect(service.update('page-1', 'site-1', { name: 'about-page' }))
      .resolves.toMatchObject({ name: 'about-page', title: 'Tentang Kami' });
  });

  it('creates a translation for an active website language', async () => {
    const { service, pageTranslationRepo } = createService();

    await expect(service.upsertTranslation('page-1', 'site-1', 'en', {
      title: 'About Us',
      slug: 'about-us',
      seo_title: 'About Us | Acme',
      seo_description: 'Meet our team.',
      seo_image: 'https://example.com/about.png',
      seo_no_index: false,
    })).resolves.toEqual({
      locale: 'en',
      title: 'About Us',
      slug: 'about-us',
      seo_title: 'About Us | Acme',
      seo_description: 'Meet our team.',
      seo_image: 'https://example.com/about.png',
      seo_no_index: false,
    });

    expect(pageTranslationRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      website_id: 'site-1',
      page_id: 'page-1',
      locale: 'en',
      slug: 'about-us',
      title: 'About Us',
      seo_title: 'About Us | Acme',
      seo_description: 'Meet our team.',
      seo_image: 'https://example.com/about.png',
      seo_no_index: false,
    }));
  });

  it('updates localized SEO fields without replacing the translated page identity', async () => {
    const { service, pageTranslationRepo } = createService();
    const existing = {
      website_id: 'site-1',
      page_id: 'page-1',
      locale: 'en',
      title: 'About Us',
      slug: 'about-us',
      seo_title: null,
      seo_description: null,
      seo_image: null,
      seo_no_index: false,
    };
    pageTranslationRepo.findOne = jest.fn().mockResolvedValue(existing);

    await expect(service.upsertTranslation('page-1', 'site-1', 'en', {
      title: 'About Us',
      slug: 'about-us',
      seo_title: '  About Us | Acme  ',
      seo_description: '  ',
      seo_image: ' https://example.com/about.png ',
      seo_no_index: true,
    })).resolves.toMatchObject({
      locale: 'en',
      title: 'About Us',
      slug: 'about-us',
      seo_title: 'About Us | Acme',
      seo_description: null,
      seo_image: 'https://example.com/about.png',
      seo_no_index: true,
    });
  });

  it('uses the original page title when a translation is left blank', async () => {
    const { service } = createService();

    await expect(service.upsertTranslation('page-1', 'site-1', 'en', { title: '  ', slug: 'about-us' }))
      .resolves.toMatchObject({ title: 'Tentang Kami' });
  });

  it('rejects translations for inactive or unknown website languages', async () => {
    const { service, languageRepo } = createService();
    languageRepo.findOne = jest.fn().mockResolvedValue(null);

    await expect(service.upsertTranslation('page-1', 'site-1', 'fr', { title: 'À propos', slug: 'a-propos' }))
      .rejects.toBeInstanceOf(NotFoundException);
  });
});
