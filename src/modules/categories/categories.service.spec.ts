import { BadRequestException } from '@nestjs/common';

import { CategoriesService } from './categories.service';

describe('CategoriesService', () => {
  const createService = () => {
    const categoryRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((value) => value),
      save: jest.fn((value) => Promise.resolve(value)),
      remove: jest.fn(),
    };
    const translationRepo = {
      findOne: jest.fn(),
      create: jest.fn((value) => value),
      save: jest.fn((value) => Promise.resolve(value)),
    };
    const languageRepo = { findOne: jest.fn() };
    return {
      service: new CategoriesService(categoryRepo as never, translationRepo as never, languageRepo as never),
      categoryRepo,
      translationRepo,
      languageRepo,
    };
  };

  it('uses the localized label as the default stable category identity', async () => {
    const { service, categoryRepo } = createService();
    const saved = { id: 'category-1', website_id: 'website-1', identity_name: 'Atasan', label: 'Atasan' };
    categoryRepo.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(saved);

    await expect(service.create('website-1', { label: ' Atasan ' })).resolves.toBe(saved);
    expect(categoryRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      identity_name: 'Atasan',
      label: 'Atasan',
    }));
  });

  it('upserts translation content only for an active website language', async () => {
    const { service, categoryRepo, translationRepo, languageRepo } = createService();
    const category = { id: 'category-1', website_id: 'website-1' };
    categoryRepo.findOne.mockResolvedValue(category);
    languageRepo.findOne.mockResolvedValue({ locale: 'en', is_active: true });
    translationRepo.findOne.mockResolvedValue(null);
    translationRepo.save.mockImplementation((value) => Promise.resolve(value));

    await service.upsertTranslation('website-1', 'category-1', 'en', {
      label: ' Tops ',
      description: ' Clothing ',
    });

    expect(translationRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      website_id: 'website-1',
      category_id: 'category-1',
      locale: 'en',
      label: 'Tops',
      description: 'Clothing',
    }));
  });

  it('rejects translations for inactive or unknown website languages', async () => {
    const { service, categoryRepo, languageRepo, translationRepo } = createService();
    categoryRepo.findOne.mockResolvedValue({ id: 'category-1', website_id: 'website-1' });
    languageRepo.findOne.mockResolvedValue({ locale: 'en', is_active: false });

    await expect(service.upsertTranslation('website-1', 'category-1', 'en', { label: 'Tops' }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(translationRepo.save).not.toHaveBeenCalled();
  });
});
