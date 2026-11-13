import type { WebsiteTemplateVersion } from '../../entities';

import { resolveTemplateRuntime } from './template-runtime-resolution';

const version = (overrides: Partial<WebsiteTemplateVersion> = {}) =>
  ({
    id: 'v1',
    template_id: 'tpl-package',
    version: '1.1.0',
    status: 'published',
    manifest: { pageOverrides: ['header', 'cart'] },
    ...overrides,
  }) as WebsiteTemplateVersion;

describe('resolveTemplateRuntime', () => {
  it('uses the pinned package version and its declared system pages', () => {
    expect(
      resolveTemplateRuntime(
        { template_version_id: 'v1', template: { id: 'tpl-package', slug: 'kumpul', source: 'package' } },
        version(),
      ),
    ).toEqual({ slug: 'kumpul', version: '1.1.0', status: 'published', pageOverrides: ['header', 'cart'] });
  });

  it('never routes a built-in template through the external runtime, even with a legacy pin', () => {
    expect(
      resolveTemplateRuntime(
        { template_version_id: null, template: { id: 'tpl-builtin', slug: 'store-classic', source: 'builtin' } },
        null,
      ),
    ).toBeNull();
  });

  it('ignores pins that point to another template or are missing', () => {
    const website = { template_version_id: 'v1', template: { id: 'tpl-package', slug: 'kumpul', source: 'package' } };
    expect(resolveTemplateRuntime(website, version({ template_id: 'other-template' }))).toBeNull();
    expect(resolveTemplateRuntime(website, null)).toBeNull();
    expect(resolveTemplateRuntime({ ...website, template_version_id: null }, version())).toBeNull();
  });

  it('reports revoked versions so the renderer can show a clear error', () => {
    expect(
      resolveTemplateRuntime(
        { template_version_id: 'v1', template: { id: 'tpl-package', slug: 'kumpul', source: 'package' } },
        version({ status: 'revoked', manifest: {} }),
      ),
    ).toMatchObject({ status: 'revoked', pageOverrides: [] });
  });

  it('carries the palette of the pinned version, not the catalogue, for template-color resets', () => {
    const resolved = resolveTemplateRuntime(
      { template_version_id: 'v1', template: { id: 'tpl-package', slug: 'kumpul', source: 'package' } },
      version({
        manifest: {
          pageOverrides: [],
          theme: { mode: 'light', colors: { background: '#ffffff', text: '#18181b', accent: '#00608e', bogus: 'red' } },
        },
      }),
    );
    expect(resolved?.theme).toEqual({ mode: 'light', colors: { background: '#ffffff', text: '#18181b', accent: '#00608e' } });
  });
});
