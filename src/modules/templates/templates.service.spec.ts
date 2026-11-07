import { InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { ArrayContains, Repository } from 'typeorm';

import { WebsiteTemplate } from '../../entities';

import { BUILTIN_TEMPLATE_MANIFESTS } from './template-manifest';
import { TemplatesService } from './templates.service';

describe('TemplatesService', () => {
  let service: TemplatesService;
  let templateRepo: jest.Mocked<Pick<Repository<WebsiteTemplate>, 'find' | 'findOne'>>;

  const makeTemplate = (manifest: WebsiteTemplate['manifest']): WebsiteTemplate => ({
    id: 'template-id',
    name: 'Template',
    slug: 'barber-classic',
    description: null,
    preview_image: null,
    structure: {},
    is_active: true,
    business_profiles: [],
    manifest,
    created_at: new Date(),
    updated_at: new Date(),
  });

  beforeEach(() => {
    templateRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
    };
    service = new TemplatesService(templateRepo as unknown as Repository<WebsiteTemplate>);
  });

  it('returns a manifest with schemas for only the declared section types', async () => {
    const manifest = {
      ...BUILTIN_TEMPLATE_MANIFESTS[0],
      sections: ['hero', 'unknown_section', 'about'],
    };
    templateRepo.findOne.mockResolvedValue(makeTemplate(manifest));

    const response = await service.findManifestBySlug('barber-classic');

    expect(response).toMatchObject(manifest);
    expect(response.sectionSchemas.map((schema) => schema.type)).toEqual(['hero', 'about']);
  });

  it('filters active templates by business profile when requested', async () => {
    templateRepo.find.mockResolvedValue([]);

    await service.findAll('online_store');

    expect(templateRepo.find).toHaveBeenCalledWith({
      where: { is_active: true, business_profiles: ArrayContains(['online_store']) },
      order: { name: 'ASC' },
    });
  });

  it('keeps the existing unfiltered template list when no profile is provided', async () => {
    templateRepo.find.mockResolvedValue([]);

    await service.findAll();

    expect(templateRepo.find).toHaveBeenCalledWith({
      where: { is_active: true },
      order: { name: 'ASC' },
    });
  });

  it('returns not found when the template does not exist', async () => {
    templateRepo.findOne.mockResolvedValue(null);

    await expect(service.findManifestBySlug('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns not found when the template has no manifest', async () => {
    templateRepo.findOne.mockResolvedValue(makeTemplate(null));

    await expect(service.findManifestBySlug('legacy-template')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects malformed manifests rather than returning an invalid response', async () => {
    templateRepo.findOne.mockResolvedValue(
      makeTemplate({ slug: 'broken-template', sections: 'not-an-array' }),
    );

    await expect(service.findManifestBySlug('broken-template')).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });
});
