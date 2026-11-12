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
