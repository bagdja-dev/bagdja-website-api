import { Repository } from 'typeorm';

import {
  Website,
  WebsiteCategory,
  WebsiteEventProductOption,
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
      repo<WebsiteEventProductOption>(),
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
      repo<WebsiteEventProductOption>(),
    );

    await service.bootstrap({ id: 'w1', theme: {}, tagline: null } as unknown as Website, null);

    expect((sectionRepo.create as jest.Mock).mock.calls[0][0]).toMatchObject({ type: 'hero', is_seed: true });
  });
});

describe('WebsiteBootstrapService sample data (template-sample-data-plan)', () => {
  const repo = <T>(overrides: Record<string, unknown> = {}): Repository<T> =>
    ({
      create: jest.fn((input: unknown) => input),
      save: jest.fn(async (input: Record<string, unknown>) => ({ id: `id-${Math.random()}`, ...input })),
      count: jest.fn().mockResolvedValue(0),
      findOne: jest.fn().mockResolvedValue(null),
      ...overrides,
    }) as unknown as Repository<T>;

  const structure = {
    master_defaults: {
      gatherings: [{ name: 'Family Camp', price: 350000, min_attendees: 4, max_attendees: 40 }],
      faqs: [{ question: 'Q', answer: 'A' }],
    },
  };

  function setup(productCount: number) {
    const products = repo<WebsiteProduct>({ count: jest.fn().mockResolvedValue(productCount) });
    const faqs = repo<WebsiteFaq>();
    const templates = repo<WebsiteTemplate>({ findOne: jest.fn().mockResolvedValue({ structure }) });
    const options = repo<WebsiteEventProductOption>();
    const service = new WebsiteBootstrapService(
      templates,
      repo<WebsitePage>(),
      repo<WebsiteSection>(),
      repo<WebsiteLocation>(),
      products,
      faqs,
      repo<WebsiteCategory>(),
      repo<Website>(),
      options,
    );
    return { service, products, faqs, templates, options };
  }

  it('seeds gathering products with attendee bounds and marks FAQs as seed when the website is empty', async () => {
    const { service, products, faqs } = setup(0);
    await expect(service.seedSampleDataIfEmpty({ id: 'w1', tagline: 'Punya sendiri' } as Website, 't1')).resolves.toBe(true);
    expect(products.save).toHaveBeenCalledWith(expect.objectContaining({
      type: 'gathering',
      name: 'Family Camp',
      metadata: { is_seed: true, min_attendees: 4, max_attendees: 40 },
    }));
    expect(faqs.save).toHaveBeenCalledWith(expect.objectContaining({ metadata: { is_seed: true } }));
  });

  it('seeds gathering detail HTML, deposit, cancellation policy and every package option in manifest order', async () => {
    const { service, products, options } = setup(0);
    const gathering = {
      name: 'Bukber Limbangan',
      price: 50000,
      min_attendees: 4,
      max_attendees: 20,
      description: '<p>Buka puasa <strong>bersama</strong></p><script>alert(1)</script>',
      detail: '<h3>Paket</h3><ul><li><p>Takjil</p></li></ul><img src="http://insecure.test/x.png">',
      deposit_amount_per_seat: 10000,
      cancellation_policy: {
        penalty_type: 'PERCENTAGE',
        penalty_value: 25,
        cutoff_days_before_event: 2,
        prepare_days_before_event: 3,
        participant_terms: '<ol><li><p>Hadir tepat waktu</p></li></ol><iframe src="https://evil.test"></iframe>',
      },
      options: [
        {
          option_group_key: 'paket',
          option_key: 'liwet',
          label: 'Paket Liwet',
          description: '<p>Nasi liwet</p><h3>tidak diizinkan di basic</h3>',
          venue_location: 'Asep Stroberi',
          venue_map_url: 'https://maps.app.goo.gl/abc',
          benefits: ['Takjil'],
          images: ['https://cdn.test/liwet.jpg'],
          availability_window: { note: 'Tersedia selama acara' },
        },
        { option_group_key: 'paket', option_key: 'maru', label: 'House of Maru' },
      ],
    };
    (service as unknown as { templateRepo: { findOne: jest.Mock } }).templateRepo.findOne
      .mockResolvedValue({ structure: { master_defaults: { gatherings: [gathering] } } });

    await expect(service.seedSampleDataIfEmpty({ id: 'w1', tagline: 'x' } as Website, 't1')).resolves.toBe(true);

    const saved = (products.save as jest.Mock).mock.calls[0][0] as Partial<WebsiteProduct>;
    expect(saved.description).toBe('<p>Buka puasa <strong>bersama</strong></p>');
    expect(saved.detail).toBe('<h3>Paket</h3><ul><li><p>Takjil</p></li></ul>');
    const policy = {
      version: 1,
      prepare_days_before_event: 3,
      cutoff_days_before_event: 2,
      penalty_type: 'PERCENTAGE',
      penalty_value: 25,
      currency: 'IDR',
      participant_terms: '<ol><li><p>Hadir tepat waktu</p></li></ol>',
    };
    expect(saved.metadata).toEqual({
      is_seed: true,
      min_attendees: 4,
      max_attendees: 20,
      deposit_amount_per_seat: 10000,
      cancellation_policy: policy,
    });

    const created = (options.save as jest.Mock).mock.calls.map(([input]) => input as Partial<WebsiteEventProductOption>);
    expect(created).toHaveLength(2);
    expect(created[0]).toMatchObject({
      website_id: 'w1',
      option_group_key: 'paket',
      option_key: 'liwet',
      label: 'Paket Liwet',
      description: '<p>Nasi liwet</p>tidak diizinkan di basic',
      price_per_seat: '50000',
      deposit_amount_per_seat: '10000',
      min_attendees: 4,
      max_attendees: 20,
      venue_location: 'Asep Stroberi',
      venue_map_url: 'https://maps.app.goo.gl/abc',
      benefits: ['Takjil'],
      images: ['https://cdn.test/liwet.jpg'],
      availability_window: { note: 'Tersedia selama acara' },
      cancellation_policy: policy,
      is_active: true,
      sort_order: 0,
    });
    expect(created[1]).toMatchObject({ option_key: 'maru', sort_order: 1, description: null, benefits: [], images: [] });
    expect(created.every((option) => option.product_id === created[0].product_id)).toBe(true);
  });

  it('never adds sample data to a website that already has products', async () => {
    const { service, products } = setup(3);
    await expect(service.seedSampleDataIfEmpty({ id: 'w1' } as Website, 't1')).resolves.toBe(false);
    expect(products.save).not.toHaveBeenCalled();
  });

  it('bootstraps sample data from the selected candidate structure instead of the published template structure', async () => {
    const { service, products, faqs, templates } = setup(0);
    const candidateStructure = {
      master_defaults: {
        gatherings: [{ name: 'Gathering Kandidat', price: 250000, min_attendees: 2, max_attendees: 20 }],
        faqs: [{ question: 'FAQ kandidat?', answer: 'Jawaban kandidat.' }],
      },
    };

    await service.bootstrap(
      { id: 'w1', theme: {}, tagline: null } as Website,
      'published-template',
      candidateStructure,
    );

    expect(templates.findOne).not.toHaveBeenCalled();
    expect(products.save).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Gathering Kandidat',
      metadata: { is_seed: true, min_attendees: 2, max_attendees: 20 },
    }));
    expect(faqs.save).toHaveBeenCalledWith(expect.objectContaining({
      question: 'FAQ kandidat?',
      metadata: { is_seed: true },
    }));
  });

  it('removes seed products, deactivates the ones still referenced, and removes seed FAQs', async () => {
    const queryBuilder = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        { id: 'p1', parent_product_id: null },
        { id: 'p2', parent_product_id: null },
      ]),
    };
    const products = repo<WebsiteProduct>({
      createQueryBuilder: jest.fn(() => queryBuilder),
      delete: jest.fn(async ({ id }: { id: string }) => {
        if (id === 'p2') throw new Error('violates foreign key constraint on website_orders');
        return { affected: 1 };
      }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    });
    const faqBuilder = {
      delete: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 2 }),
    };
    const service = new WebsiteBootstrapService(
      repo<WebsiteTemplate>(),
      repo<WebsitePage>(),
      repo<WebsiteSection>(),
      repo<WebsiteLocation>(),
      products,
      repo<WebsiteFaq>({ createQueryBuilder: jest.fn(() => faqBuilder) }),
      repo<WebsiteCategory>(),
      repo<Website>(),
      repo<WebsiteEventProductOption>(),
    );
    await expect(service.removeSampleData('w1')).resolves.toEqual({ removedProducts: 1, deactivatedProducts: 1, removedFaqs: 2 });
    expect(products.update).toHaveBeenCalledWith({ id: 'p2', website_id: 'w1' }, { is_active: false });
  });
});
