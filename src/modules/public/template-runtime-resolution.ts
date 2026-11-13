import { sanitizeWebsiteTheme, type WebsiteTheme } from '../../common/website-theme';
import type { Website, WebsiteTemplateVersion } from '../../entities';

/**
 * Keputusan runtime template untuk renderer publik.
 *
 * Template eksternal HANYA dipakai bila template website bersumber dari package
 * (`website_templates.source = 'package'`) dan website ter-pin ke baris
 * `website_template_version` milik template yang sama. Template bawaan selalu
 * memakai renderer bawaan — `template_runtime_version` sisa uji lama pada
 * template bawaan (mis. `store-classic@1.0.7`) diabaikan, sehingga slug bawaan
 * tidak pernah bisa "dibajak" artefak eksternal bernama sama.
 */
export interface TemplateRuntimeResolution {
  slug: string;
  version: string;
  status: WebsiteTemplateVersion['status'];
  /** Halaman sistem milik template (manifest versi terpasang), untuk renderer P1. */
  pageOverrides: string[];
  /**
   * Palet bawaan versi terpasang (`manifest.theme`). Dipakai sebagai `templateTheme` agar reset
   * warna & halaman Bagdja mengikuti versi yang dipakai, bukan versi terbaru di katalog.
   */
  theme?: WebsiteTheme;
}

/** `manifest.theme` versi template → tema tersanitasi, atau undefined bila tidak dideklarasikan. */
export function manifestTemplateTheme(manifest: unknown): WebsiteTheme | undefined {
  const raw = manifest && typeof manifest === 'object' ? (manifest as { theme?: unknown }).theme : undefined;
  const theme = sanitizeWebsiteTheme(raw);
  return Object.keys(theme).length ? theme : undefined;
}

export function resolveTemplateRuntime(
  website: Pick<Website, 'template_version_id'> & {
    template?: { id: string; slug: string; source?: string | null } | null;
  },
  pinnedVersion: WebsiteTemplateVersion | null,
): TemplateRuntimeResolution | null {
  const template = website.template;
  if (!template || template.source !== 'package') return null;
  if (!website.template_version_id || !pinnedVersion) return null;
  if (pinnedVersion.id !== website.template_version_id || pinnedVersion.template_id !== template.id) return null;
  const manifest = pinnedVersion.manifest as { pageOverrides?: unknown } | null;
  const pageOverrides = Array.isArray(manifest?.pageOverrides)
    ? manifest!.pageOverrides.filter((page): page is string => typeof page === 'string')
    : [];
  const theme = manifestTemplateTheme(pinnedVersion.manifest);
  return {
    slug: template.slug,
    version: pinnedVersion.version,
    status: pinnedVersion.status,
    pageOverrides,
    ...(theme ? { theme } : {}),
  };
}
