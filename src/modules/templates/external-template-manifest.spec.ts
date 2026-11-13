import {
  checkExternalTemplateManifest,
  checkTemplateSlug,
  RESERVED_TEMPLATE_SLUGS,
  toBootstrapStructure,
  toCatalogTemplateManifest,
  compareSemver,
} from './external-template-manifest';
import { isTemplateManifest } from './template-manifest';

function validManifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    manifestVersion: 1,
    slug: 'storefront-classic',
    name: 'Storefront Classic',
    version: '1.1.0',
    rendererApiVersion: 1,
    businessProfiles: ['online_store'],
    capabilities: ['catalog', 'cart', 'checkout', 'orders'],
    sections: ['hero', 'products_grid', 'faq_list'],
    pageOverrides: ['order_detail', 'header'],
    entry: { server: 'dist/server.cjs', client: 'dist/client.js' },
    defaultPages: [
      {
        slug: 'home',
        title: 'Beranda',
        isHome: true,
        sections: [
          { type: 'hero', content: { subtitle: 'Koleksi terbaru' } },
          { type: 'products_grid', content: { title: 'Produk' } },
        ],
      },
      { slug: 'faq', title: 'FAQ', sections: [{ type: 'faq_list', content: {} }] },
    ],
    ...overrides,
  };
}

function codes(result: ReturnType<typeof checkExternalTemplateManifest>): string[] {
  return result.issues.map((issue) => issue.code);
}

describe('checkExternalTemplateManifest', () => {
  it('accepts a complete manifest and converts it to a catalog manifest', () => {
    const result = checkExternalTemplateManifest(validManifest(), { packageVersion: '1.1.0' });

    expect(result.issues).toEqual([]);
    expect(result.manifest).not.toBeNull();
    expect(result.manifest?.entry).toEqual({ server: 'dist/server.cjs', client: 'dist/client.js' });

    const catalog = toCatalogTemplateManifest(result.manifest!);
    expect(catalog.isBuiltin).toBe(false);
    expect(isTemplateManifest(catalog)).toBe(true);
  });

  it('rejects built-in slugs so packages cannot shadow Bagdja templates', () => {
    for (const slug of RESERVED_TEMPLATE_SLUGS) {
      const result = checkExternalTemplateManifest(validManifest({ slug }), {
        packageVersion: '1.1.0',
      });
      expect(result.manifest).toBeNull();
      expect(codes(result)).toContain('slug_reserved');
    }
  });

  it('rejects malformed slugs', () => {
    expect(checkTemplateSlug('Store_Classic')?.code).toBe('slug_invalid');
    expect(checkTemplateSlug('-store')?.code).toBe('slug_invalid');
    expect(checkTemplateSlug('storefront-classic')).toBeNull();
  });

  it('requires the manifest version to equal the registered npm version', () => {
    const result = checkExternalTemplateManifest(validManifest(), { packageVersion: '1.2.0' });
    expect(result.manifest).toBeNull();
    expect(codes(result)).toContain('version_mismatch');
  });

  it('preserves a validated package theme in the template structure', () => {
    const theme = {
      mode: 'light',
      preset: 'light',
      colors: { background: '#ffffff', text: '#18181b', accent: '#00608e' },
    };
    const { manifest, issues } = checkExternalTemplateManifest(validManifest({ theme }), { packageVersion: '1.1.0' });

    expect(issues).toEqual([]);
    expect(toBootstrapStructure(manifest!)).toMatchObject({ theme });
  });

  it('rejects invalid package theme colors', () => {
    const result = checkExternalTemplateManifest(
      validManifest({ theme: { mode: 'light', colors: { accent: 'orange' } } }),
      { packageVersion: '1.1.0' },
    );

    expect(result.manifest).toBeNull();
    expect(codes(result)).toContain('theme_invalid');
  });

  it('explains legacy capability values from the old sample manifest', () => {
    const result = checkExternalTemplateManifest(
      validManifest({ capabilities: ['server_render', 'catalog_read', 'catalog'] }),
      { packageVersion: '1.1.0' },
    );
    expect(result.manifest).toBeNull();
    const messages = result.issues.filter((issue) => issue.code === 'capability_unknown');
    expect(messages).toHaveLength(2);
    expect(messages[1].message).toContain('"catalog"');
  });

  it('rejects unknown and system sections', () => {
    const result = checkExternalTemplateManifest(
      validManifest({ sections: ['hero', 'checkout', 'not_a_section'], defaultPages: undefined }),
      { packageVersion: '1.1.0' },
    );
    expect(result.issues.filter((issue) => issue.code === 'section_unknown')).toHaveLength(2);
  });

  it('accepts every supported system page and rejects pages the host cannot hand over yet', () => {
    const supported = checkExternalTemplateManifest(
      validManifest({
        pageOverrides: ['header', 'cart', 'orders', 'order_detail', 'tagihan', 'invoice_detail', 'calendar', 'gathering_plan'],
      }),
      { packageVersion: '1.1.0' },
    );
    expect(supported.issues).toEqual([]);

    const unsupported = checkExternalTemplateManifest(
      validManifest({ pageOverrides: ['checkout', 'chat'] }),
      { packageVersion: '1.1.0' },
    );
    expect(unsupported.issues.filter((issue) => issue.code === 'page_override_unknown')).toHaveLength(2);
  });

  it('only allows fixed entry paths', () => {
    const result = checkExternalTemplateManifest(
      validManifest({ entry: { server: '../server.cjs', client: 'https://cdn.example/x.js' } }),
      { packageVersion: '1.1.0' },
    );
    expect(codes(result)).toEqual(
      expect.arrayContaining(['entry_server_invalid', 'entry_client_invalid']),
    );
  });

  it('requires default page sections to be declared and exactly one home page', () => {
    const result = checkExternalTemplateManifest(
      validManifest({
        defaultPages: [
          { slug: 'home', title: 'Beranda', sections: [{ type: 'gallery', content: {} }] },
        ],
      }),
      { packageVersion: '1.1.0' },
    );
    expect(codes(result)).toEqual(
      expect.arrayContaining(['default_section_not_declared', 'default_pages_home_count']),
    );
  });

  it('rejects page slugs that could collide with system routes', () => {
    const result = checkExternalTemplateManifest(
      validManifest({
        defaultPages: [{ slug: '__preview', title: 'X', isHome: true, sections: [] }],
      }),
      { packageVersion: '1.1.0' },
    );
    expect(codes(result)).toContain('default_page_slug_invalid');
  });

  it('warns but still accepts a manifest without default pages or with isBuiltin', () => {
    const result = checkExternalTemplateManifest(
      validManifest({ defaultPages: undefined, isBuiltin: true }),
      { packageVersion: '1.1.0' },
    );
    expect(result.manifest).not.toBeNull();
    expect(result.manifest).not.toHaveProperty('isBuiltin');
    expect(result.issues.every((issue) => issue.level === 'warning')).toBe(true);
    expect(codes(result)).toEqual(
      expect.arrayContaining(['default_pages_missing', 'is_builtin_ignored']),
    );
  });

  it('rejects non-object input', () => {
    expect(codes(checkExternalTemplateManifest(null, { packageVersion: '1.0.0' }))).toEqual([
      'manifest_invalid',
    ]);
  });
});

describe('toBootstrapStructure', () => {
  it('maps default pages to the structure read by WebsiteBootstrapService', () => {
    const { manifest } = checkExternalTemplateManifest(validManifest(), { packageVersion: '1.1.0' });
    expect(toBootstrapStructure(manifest!)).toEqual({
      sections: [
        { type: 'hero', defaults: { subtitle: 'Koleksi terbaru' } },
        { type: 'products_grid', defaults: { title: 'Produk' } },
      ],
      extra_pages: [{ slug: 'faq', title: 'FAQ', sections: [{ type: 'faq_list', defaults: {} }] }],
    });
  });

  it('returns an empty structure without default pages', () => {
    const { manifest } = checkExternalTemplateManifest(validManifest({ defaultPages: undefined }), {
      packageVersion: '1.1.0',
    });
    expect(toBootstrapStructure(manifest!)).toEqual({});
  });
});

describe('sampleData (template-sample-data-plan)', () => {
  const sampleData = {
    tagline: 'Kumpul bareng jadi mudah',
    categories: [{ label: 'Family', imageUrl: 'https://cdn.test/family.jpg' }],
    products: [
      { name: 'Family Camp', type: 'gathering', price: 350000, category: 'Family', minAttendees: 4, maxAttendees: 40, images: ['https://cdn.test/camp.jpg'] },
      { name: 'Kaos', type: 'product', price: 120000 },
      { name: 'Konsultasi', type: 'service', price: 200000, durationMinutes: 60 },
    ],
    faqs: [{ question: 'Bagaimana cara ikut?', answer: 'RSVP lewat undangan.' }],
  };

  it('accepts valid sample data and maps it to master_defaults for the bootstrap seeder', () => {
    const { manifest, issues } = checkExternalTemplateManifest(validManifest({ sampleData }), { packageVersion: '1.1.0' });
    expect(issues.filter((issue) => issue.level === 'error')).toEqual([]);
    expect(toBootstrapStructure(manifest!).master_defaults).toEqual({
      tagline: 'Kumpul bareng jadi mudah',
      categories: [{ label: 'Family', images: ['https://cdn.test/family.jpg'] }],
      products: [{ name: 'Kaos', price: 120000 }],
      services: [{ name: 'Konsultasi', price: 200000, duration_minutes: 60 }],
      gatherings: [{ name: 'Family Camp', price: 350000, category: 'Family', images: ['https://cdn.test/camp.jpg'], min_attendees: 4, max_attendees: 40 }],
      faqs: [{ question: 'Bagaimana cara ikut?', answer: 'RSVP lewat undangan.' }],
    });
  });

  it('accepts gathering packages, HTML detail, deposit and cancellation policy and maps them for the seeder', () => {
    const gathering = {
      name: 'Bukber Limbangan',
      type: 'gathering',
      price: 50000,
      category: 'Bukber',
      minAttendees: 4,
      maxAttendees: 20,
      description: '<p>Buka puasa bersama</p>',
      detail: '<h3>Paket</h3><ul><li><p>Takjil</p></li></ul>',
      depositPerSeat: 10000,
      cancellationPolicy: {
        penaltyType: 'PERCENTAGE',
        penaltyValue: 25,
        cutoffDaysBeforeEvent: 2,
        prepareDaysBeforeEvent: 3,
        summary: '<p>Ringkasan</p>',
        participantTerms: '<ol><li><p>Hadir tepat waktu</p></li></ol>',
      },
      options: [
        {
          group: 'paket',
          key: 'paket-liwet',
          label: 'Paket Liwet',
          description: '<p>Nasi liwet</p>',
          venue: 'Asep Stroberi',
          address: 'Jl. Raya Nagreg',
          mapUrl: 'https://maps.app.goo.gl/abc',
          benefits: ['Takjil'],
          images: ['https://cdn.test/liwet.jpg'],
          availabilityNote: 'Tersedia selama acara',
        },
        { group: 'paket', key: 'house-of-maru', label: 'House of Maru' },
      ],
    };
    const { manifest, issues } = checkExternalTemplateManifest(validManifest({ sampleData: { products: [gathering] } }), { packageVersion: '1.1.0' });
    expect(issues.filter((issue) => issue.level === 'error')).toEqual([]);
    expect(toBootstrapStructure(manifest!).master_defaults).toEqual({
      gatherings: [{
        name: 'Bukber Limbangan',
        price: 50000,
        category: 'Bukber',
        description: '<p>Buka puasa bersama</p>',
        min_attendees: 4,
        max_attendees: 20,
        detail: '<h3>Paket</h3><ul><li><p>Takjil</p></li></ul>',
        deposit_amount_per_seat: 10000,
        cancellation_policy: {
          penalty_type: 'PERCENTAGE',
          penalty_value: 25,
          cutoff_days_before_event: 2,
          prepare_days_before_event: 3,
          summary: '<p>Ringkasan</p>',
          participant_terms: '<ol><li><p>Hadir tepat waktu</p></li></ol>',
        },
        options: [
          {
            option_group_key: 'paket',
            option_key: 'paket-liwet',
            label: 'Paket Liwet',
            description: '<p>Nasi liwet</p>',
            venue_location: 'Asep Stroberi',
            venue_address: 'Jl. Raya Nagreg',
            venue_map_url: 'https://maps.app.goo.gl/abc',
            benefits: ['Takjil'],
            images: ['https://cdn.test/liwet.jpg'],
            availability_window: { note: 'Tersedia selama acara' },
          },
          { option_group_key: 'paket', option_key: 'house-of-maru', label: 'House of Maru' },
        ],
      }],
    });
  });

  it.each([
    ['unknown type', { products: [{ name: 'X', type: 'digital', price: 1 }] }],
    ['decimal price', { products: [{ name: 'X', type: 'product', price: 1.5 }] }],
    ['http image', { products: [{ name: 'X', type: 'product', price: 1, images: ['http://cdn.test/x.jpg'] }] }],
    ['gathering bounds', { products: [{ name: 'X', type: 'gathering', price: 1, minAttendees: 10, maxAttendees: 2 }] }],
    ['empty faq', { faqs: [{ question: '', answer: 'x' }] }],
    ['too many categories', { categories: Array.from({ length: 21 }, (_, index) => ({ label: `C${index}` })) }],
    ['deposit above seat price', { products: [{ name: 'X', type: 'gathering', price: 50000, minAttendees: 4, maxAttendees: 20, depositPerSeat: 60000 }] }],
    ['options on a non-gathering product', { products: [{ name: 'X', type: 'product', price: 1, options: [] }] }],
    ['invalid cancellation policy', { products: [{ name: 'X', type: 'gathering', price: 50000, minAttendees: 4, maxAttendees: 20, cancellationPolicy: { penaltyType: 'PERCENTAGE', penaltyValue: 150 } }] }],
    ['duplicate option key', { products: [{ name: 'X', type: 'gathering', price: 50000, minAttendees: 4, maxAttendees: 20, options: [{ group: 'paket', key: 'a', label: 'A' }, { group: 'paket', key: 'a', label: 'B' }] }] }],
    ['option key with spaces', { products: [{ name: 'X', type: 'gathering', price: 50000, minAttendees: 4, maxAttendees: 20, options: [{ group: 'Paket Utama', key: 'a', label: 'A' }] }] }],
    ['non Google Maps option link', { products: [{ name: 'X', type: 'gathering', price: 50000, minAttendees: 4, maxAttendees: 20, options: [{ group: 'paket', key: 'a', label: 'A', mapUrl: 'https://evil.test/maps' }] }] }],
    ['too many option images', { products: [{ name: 'X', type: 'gathering', price: 50000, minAttendees: 4, maxAttendees: 20, options: [{ group: 'paket', key: 'a', label: 'A', images: Array.from({ length: 6 }, (_, i) => `https://cdn.test/${i}.jpg`) }] }] }],
  ])('rejects invalid sample data: %s', (_label, value) => {
    expect(codes(checkExternalTemplateManifest(validManifest({ sampleData: value }), { packageVersion: '1.1.0' })))
      .toContain('sample_data_invalid');
  });
});

describe('compareSemver', () => {
  it.each([
    ['1.0.0', '1.0.1', -1],
    ['1.10.0', '1.9.9', 1],
    ['2.0.0-beta.2', '2.0.0-beta.10', -1],
    ['2.0.0-rc.1', '2.0.0', -1],
    ['2.0.0+build.1', '2.0.0', 0],
  ])('compares %s with %s', (a, b, sign) => {
    expect(Math.sign(compareSemver(a, b))).toBe(sign);
  });
});
