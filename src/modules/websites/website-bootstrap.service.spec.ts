import { Repository } from 'typeorm';

import {
  Website,
  WebsiteCategory,
  WebsiteFaq,
  WebsiteLocation,
  WebsitePage,
  WebsiteProduct,
  WebsiteSection,
  WebsiteTemplate,
} from '../../entities';

import { WebsiteBootstrapService, buildSeedProductMetadata } from './website-bootstrap.service';

describe('buildSeedProductMetadata', () => {
  it('marks seeded products and preserves their seed metadata', () => {
    expect(
      buildSeedProductMetadata(
        {
          name: 'Contoh layanan',
          price: 250000,
          sku: 'SVC-01',
          duration_minutes: 60,
          variant_attributes: { ukuran: 'M' },
          inherit_description: true,
        },
        'service',
      ),
    ).toEqual({
      is_seed: true,
      sku: 'SVC-01',
      duration_minutes: 60,
      variant_attributes: { ukuran: 'M' },
      inherit_description: true,
    });
  });

  it('does not attach service-only metadata to seeded products', () => {
    expect(
      buildSeedProductMetadata(
        { name: 'Contoh produk', price: 100000, duration_minutes: 60 },
        'product',
      ),
    ).toEqual({ is_seed: true });
  });
});

describe('WebsiteBootstrapService seeded sections', () => {
  const repo = <T>(overrides: Record<string, jest.Mock> = {}): Repository<T> =>
    ({
      create: jest.fn((input: unknown) => input),
      save: jest.fn(async (input: Record<string, unknown>) => ({ id: `id-${Math.random()}`, ...input })),
      count: jest.fn().mockResolvedValue(0),
      findOne: jest.fn().mockResolvedValue(null),
      ...overrides,
    }) as unknown as Repository<T>;

  it('marks every template section (home + extra pages) with is_seed = true', async () => {
    const structure = {
      sections: [
        { type: 'hero', defaults: { title: 'Contoh' } },
        { type: 'about', defaults: {} },
      ],
      extra_pages: [{ slug: 'faq', title: 'FAQ', sections: [{ type: 'faq_list' }] }],
    };
    const sectionRepo = repo<WebsiteSection>();
    const service = new WebsiteBootstrapService(
      repo<WebsiteTemplate>({ findOne: jest.fn().mockResolvedValue({ structure }) }),
      repo<WebsitePage>(),
      sectionRepo,
      repo<WebsiteLocation>(),
      repo<WebsiteProduct>(),
      repo<WebsiteFaq>(),
      repo<WebsiteCategory>(),
      repo<Website>(),
    );

    await service.bootstrap({ id: 'w1', theme: {}, tagline: null } as unknown as Website, 't1');

    const created = (sectionRepo.create as jest.Mock).mock.calls.map(([input]) => input as Partial<WebsiteSection>);
    expect(created.map((s) => s.type)).toEqual(['hero', 'about', 'faq_list']);
    expect(created.every((s) => s.is_seed === true)).toBe(true);
  });

  it('marks the fallback hero (template without sections) as seed', async () => {
    const sectionRepo = repo<WebsiteSection>();
    const service = new WebsiteBootstrapService(
      repo<WebsiteTemplate>(),
      repo<WebsitePage>(),
      sectionRepo,
      repo<WebsiteLocation>(),
      repo<WebsiteProduct>(),
      repo<WebsiteFaq>(),
      repo<WebsiteCategory>(),
      repo<Website>(),
    );

    await service.bootstrap({ id: 'w1', theme: {}, tagline: null } as unknown as Website, null);

    expect((sectionRepo.create as jest.Mock).mock.calls[0][0]).toMatchObject({ type: 'hero', is_seed: true });
  });
});
