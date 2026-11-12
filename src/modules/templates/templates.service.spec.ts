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
    source: 'builtin',
    package_name: null,
    designer_user_id: null,
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
    const manifest = { ...BUILTIN_TEMPLATE_MANIFESTS[0] };
    templateRepo.findOne.mockResolvedValue(makeTemplate(manifest));

    const response = await service.findManifestBySlug('barber-classic');

    expect(response).toMatchObject(manifest);
    expect(response.sectionSchemas.map((schema) => schema.type)).toEqual(manifest.sections);
  });

  it('filters active templates by business profile when requested', async () => {
    templateRepo.find.mockResolvedValue([
      makeTemplate({ ...BUILTIN_TEMPLATE_MANIFESTS[0] }),
      { ...makeTemplate({ ...BUILTIN_TEMPLATE_MANIFESTS[0] }), slug: 'unbuilt-template' },
    ] as WebsiteTemplate[]);

    const result = await service.findAll('online_store');

    expect(templateRepo.find).toHaveBeenCalledWith({
      where: { is_active: true, business_profiles: ArrayContains(['online_store']) },
      order: { name: 'ASC' },
    });
    expect(result.map((template) => template.slug)).toEqual(['barber-classic']);
  });

  it('keeps the existing unfiltered template list when no profile is provided', async () => {
    templateRepo.find.mockResolvedValue([
      makeTemplate({ ...BUILTIN_TEMPLATE_MANIFESTS[0] }),
      { ...makeTemplate({ ...BUILTIN_TEMPLATE_MANIFESTS[0] }), slug: 'unbuilt-template' },
    ] as WebsiteTemplate[]);

    const result = await service.findAll();

    expect(templateRepo.find).toHaveBeenCalledWith({
      where: { is_active: true },
      order: { name: 'ASC' },
    });
    expect(result.map((template) => template.slug)).toEqual(['barber-classic']);
  });

  it('lists an active external template manifest published by the runtime pipeline', async () => {
    const externalManifest = {
      ...BUILTIN_TEMPLATE_MANIFESTS[1],
      slug: 'storefront-demo',
      name: 'Storefront Demo',
      version: '1.2.3',
      isBuiltin: false,
    };
    const external = { ...makeTemplate(externalManifest), slug: externalManifest.slug };
    templateRepo.find.mockResolvedValue([external]);
    templateRepo.findOne.mockResolvedValue(external);

    await expect(service.findAll('online_store')).resolves.toEqual([external]);
    await expect(service.findManifestBySlug('storefront-demo')).resolves.toMatchObject({
      slug: 'storefront-demo',
      version: '1.2.3',
      sectionSchemas: expect.arrayContaining([expect.objectContaining({ type: 'hero' })]),
    });
  });

  it('does not expose a built-in template with a renderer-incompatible manifest version', async () => {
    templateRepo.findOne.mockResolvedValue(
      makeTemplate({ ...BUILTIN_TEMPLATE_MANIFESTS[0], version: '2.0.0' }),
    );

    await expect(service.findManifestBySlug('barber-classic')).rejects.toBeInstanceOf(NotFoundException);
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
