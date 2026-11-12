/**
 * Manifest package template eksternal (plan/website-builder/
 * template-submission-review-publication-flow.md §6).
 *
 * `manifest.json` di root tarball npm memakai kosakata yang sama dengan
 * `TemplateManifest` API, sehingga hasil "Cek package" dapat dipakai langsung
 * tanpa ditulis ulang oleh reviewer. Fungsi di file ini murni (tanpa I/O);
 * kepemilikan slug oleh package lain dicek di service karena butuh database.
 */
import {
  SELECTABLE_BUSINESS_PROFILE_IDS,
  type BusinessProfileId,
} from '../websites/business-profile.registry';

import { getSectionSchema } from './section-schema.registry';
import {
  BUILTIN_TEMPLATE_MANIFESTS,
  RENDERER_API_VERSION,
  TEMPLATE_CAPABILITIES,
  type TemplateCapability,
  type TemplateManifest,
} from './template-manifest';

export const EXTERNAL_MANIFEST_VERSION = 1;

/** Path entry yang dibaca intake dari tarball (tetap, bukan pilihan designer). */
export const EXTERNAL_SERVER_ENTRY = 'dist/server.cjs';
export const EXTERNAL_CLIENT_ENTRY = 'dist/client.js';

/**
 * Halaman sistem yang boleh dirender template (plan/website-builder/
 * template-owned-system-pages-plan.md §4.1). Kontrak data: `props.page`
 * (bagdja-website-template-runtime/contract/page-contract.d.ts).
 */
export const TEMPLATE_PAGE_OVERRIDES = [
  'header',
  'cart',
  'orders',
  'order_detail',
  'tagihan',
  'invoice_detail',
  'calendar',
  'gathering_plan',
] as const;
export type TemplatePageOverride = (typeof TEMPLATE_PAGE_OVERRIDES)[number];

/** Sama dengan CHECK `website_platform_template_submissions.slug`. */
export const TEMPLATE_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;

/** Slug halaman tenant tidak boleh mengandung `_` (dipakai route sistem seperti `__preview`). */
const PAGE_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;

const EXACT_SEMVER_PATTERN =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;

/** Kosakata manifest sample lama yang tidak lagi berlaku (G7). */
const LEGACY_CAPABILITIES: Readonly<Record<string, string>> = {
  server_render: 'SSR selalu aktif; hapus nilai ini.',
  preview: 'Preview dibuat otomatis oleh platform; hapus nilai ini.',
  catalog_read: 'Ganti dengan "catalog".',
  client_bundle: 'Client bundle terdeteksi dari entry.client; hapus nilai ini.',
  order_detail: 'Pindahkan ke pageOverrides: ["order_detail"].',
};

export const MAX_DEFAULT_PAGES = 10;
export const MAX_DEFAULT_PAGE_SECTIONS = 30;
const MAX_SECTION_CONTENT_BYTES = 20_000;

export const RESERVED_TEMPLATE_SLUGS: readonly string[] = BUILTIN_TEMPLATE_MANIFESTS.map(
  (manifest) => manifest.slug,
);

export interface ExternalTemplateDefaultSection {
  type: string;
  content: Record<string, unknown>;
}

export interface ExternalTemplateDefaultPage {
  slug: string;
  title: string;
  isHome?: boolean;
  sections: ExternalTemplateDefaultSection[];
}

export interface ExternalTemplatePackageManifest {
  manifestVersion: 1;
  slug: string;
  name: string;
  version: string;
  rendererApiVersion: 1;
  businessProfiles: BusinessProfileId[];
  capabilities: TemplateCapability[];
  sections: string[];
  pageOverrides?: TemplatePageOverride[];
  entry: { server: typeof EXTERNAL_SERVER_ENTRY; client?: typeof EXTERNAL_CLIENT_ENTRY };
  defaultPages?: ExternalTemplateDefaultPage[];
  preview?: { imageUrl?: string };
}

export type ManifestIssueLevel = 'error' | 'warning';

export interface ManifestCheckIssue {
  code: string;
  level: ManifestIssueLevel;
  /** Pesan untuk designer, bahasa Indonesia. */
  message: string;
  /** Path field di manifest, mis. `sections[2]`. */
  field?: string;
}

export interface ManifestCheckResult {
  /** Terisi hanya bila tidak ada issue `error`. */
  manifest: ExternalTemplatePackageManifest | null;
  issues: ManifestCheckIssue[];
}

export interface ManifestCheckExpectation {
  /** Versi npm yang didaftarkan designer; harus sama persis dengan manifest. */
  packageVersion: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

export function isReservedTemplateSlug(slug: string): boolean {
  return RESERVED_TEMPLATE_SLUGS.includes(slug);
}

/** Validasi format + slug cadangan. Kepemilikan slug oleh package lain dicek di service. */
export function checkTemplateSlug(slug: unknown, field = 'slug'): ManifestCheckIssue | null {
  if (typeof slug !== 'string' || !TEMPLATE_SLUG_PATTERN.test(slug)) {
    return {
      code: 'slug_invalid',
      level: 'error',
      field,
      message:
        'Slug hanya boleh huruf kecil, angka, dan tanda hubung (maks. 63 karakter), diawali huruf/angka.',
    };
  }
  if (isReservedTemplateSlug(slug)) {
    return {
      code: 'slug_reserved',
      level: 'error',
      field,
      message: `Slug "${slug}" dipakai template bawaan Bagdja. Pilih slug lain.`,
    };
  }
  return null;
}

function checkStringList<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly string[],
  issues: ManifestCheckIssue[],
  options: { required: boolean; unknownCode: string; unknownMessage: (item: string) => string },
): T[] {
  if (value === undefined && !options.required) return [];
  if (!Array.isArray(value) || (options.required && value.length === 0)) {
    issues.push({
      code: `${field}_invalid`,
      level: 'error',
      field,
      message: options.required
        ? `${field} wajib berupa daftar dan tidak boleh kosong.`
        : `${field} harus berupa daftar.`,
    });
    return [];
  }
  const seen = new Set<string>();
  const result: T[] = [];
  value.forEach((item, index) => {
    if (typeof item !== 'string' || !allowed.includes(item)) {
      issues.push({
        code: options.unknownCode,
        level: 'error',
        field: `${field}[${index}]`,
        message: options.unknownMessage(String(item)),
      });
      return;
    }
    if (seen.has(item)) {
      issues.push({
        code: `${field}_duplicate`,
        level: 'warning',
        field: `${field}[${index}]`,
        message: `"${item}" tercantum lebih dari sekali.`,
      });
      return;
    }
    seen.add(item);
    result.push(item as T);
  });
  return result;
}

function checkDefaultPages(
  value: unknown,
  sections: readonly string[],
  issues: ManifestCheckIssue[],
): ExternalTemplateDefaultPage[] | undefined {
  if (value === undefined) {
    issues.push({
      code: 'default_pages_missing',
      level: 'warning',
      field: 'defaultPages',
      message: 'Tanpa defaultPages, website baru dimulai tanpa halaman contoh.',
    });
    return undefined;
  }
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_DEFAULT_PAGES) {
    issues.push({
      code: 'default_pages_invalid',
      level: 'error',
      field: 'defaultPages',
      message: `defaultPages harus berisi 1–${MAX_DEFAULT_PAGES} halaman.`,
    });
    return undefined;
  }

  const pages: ExternalTemplateDefaultPage[] = [];
  const slugs = new Set<string>();
  let homeCount = 0;
  value.forEach((page, pageIndex) => {
    const field = `defaultPages[${pageIndex}]`;
    if (!isRecord(page)) {
      issues.push({ code: 'default_page_invalid', level: 'error', field, message: 'Halaman harus berupa objek.' });
      return;
    }
    if (typeof page.slug !== 'string' || !PAGE_SLUG_PATTERN.test(page.slug) || slugs.has(page.slug)) {
      issues.push({
        code: 'default_page_slug_invalid',
        level: 'error',
        field: `${field}.slug`,
        message: 'Slug halaman wajib unik, huruf kecil/angka/tanda hubung, tanpa garis bawah.',
      });
    } else {
      slugs.add(page.slug);
    }
    if (!isNonEmptyString(page.title, 120)) {
      issues.push({
        code: 'default_page_title_invalid',
        level: 'error',
        field: `${field}.title`,
        message: 'Judul halaman wajib diisi (maks. 120 karakter).',
      });
    }
    if (page.isHome !== undefined && typeof page.isHome !== 'boolean') {
      issues.push({
        code: 'default_page_home_invalid',
        level: 'error',
        field: `${field}.isHome`,
        message: 'isHome harus true atau false.',
      });
    }
    if (page.isHome === true) homeCount += 1;

    const pageSections: ExternalTemplateDefaultSection[] = [];
    if (
      !Array.isArray(page.sections) ||
      page.sections.length > MAX_DEFAULT_PAGE_SECTIONS
    ) {
      issues.push({
        code: 'default_page_sections_invalid',
        level: 'error',
        field: `${field}.sections`,
        message: `sections halaman harus berupa daftar (maks. ${MAX_DEFAULT_PAGE_SECTIONS}).`,
      });
    } else {
      page.sections.forEach((section, sectionIndex) => {
        const sectionField = `${field}.sections[${sectionIndex}]`;
        if (!isRecord(section) || typeof section.type !== 'string' || !isRecord(section.content)) {
          issues.push({
            code: 'default_section_invalid',
            level: 'error',
            field: sectionField,
            message: 'Section wajib punya type (teks) dan content (objek).',
          });
          return;
        }
        if (!sections.includes(section.type)) {
          issues.push({
            code: 'default_section_not_declared',
            level: 'error',
            field: `${sectionField}.type`,
            message: `Section "${section.type}" dipakai di halaman contoh tetapi tidak tercantum di sections.`,
          });
          return;
        }
        if (Buffer.byteLength(JSON.stringify(section.content)) > MAX_SECTION_CONTENT_BYTES) {
          issues.push({
            code: 'default_section_too_large',
            level: 'error',
            field: `${sectionField}.content`,
            message: 'Isi section contoh terlalu besar (maks. 20 KB).',
          });
          return;
        }
        pageSections.push({ type: section.type, content: section.content });
      });
    }

    if (typeof page.slug === 'string' && typeof page.title === 'string') {
      pages.push({
        slug: page.slug,
        title: page.title.trim(),
        ...(page.isHome === true ? { isHome: true } : {}),
        sections: pageSections,
      });
    }
  });

  if (homeCount !== 1) {
    issues.push({
      code: 'default_pages_home_count',
      level: 'error',
      field: 'defaultPages',
      message: 'Tepat satu halaman contoh harus bertanda isHome: true.',
    });
  }
  return pages;
}

/**
 * Validasi `manifest.json` package eksternal. Mengembalikan semua issue sekaligus
 * (bukan berhenti di error pertama) supaya designer bisa memperbaiki sekali jalan.
 */
export function checkExternalTemplateManifest(
  value: unknown,
  expected: ManifestCheckExpectation,
): ManifestCheckResult {
  const issues: ManifestCheckIssue[] = [];
  if (!isRecord(value)) {
    return {
      manifest: null,
      issues: [
        { code: 'manifest_invalid', level: 'error', message: 'manifest.json harus berupa objek JSON.' },
      ],
    };
  }

  if (value.manifestVersion !== EXTERNAL_MANIFEST_VERSION) {
    issues.push({
      code: 'manifest_version_unsupported',
      level: 'error',
      field: 'manifestVersion',
      message: `manifestVersion harus ${EXTERNAL_MANIFEST_VERSION}.`,
    });
  }

  const slugIssue = checkTemplateSlug(value.slug);
  if (slugIssue) issues.push(slugIssue);

  if (!isNonEmptyString(value.name, 120)) {
    issues.push({
      code: 'name_invalid',
      level: 'error',
      field: 'name',
      message: 'Nama template wajib diisi (maks. 120 karakter).',
    });
  }

  if (typeof value.version !== 'string' || !EXACT_SEMVER_PATTERN.test(value.version)) {
    issues.push({
      code: 'version_invalid',
      level: 'error',
      field: 'version',
      message: 'version harus semver exact, mis. "1.2.0".',
    });
  } else if (value.version !== expected.packageVersion) {
    issues.push({
      code: 'version_mismatch',
      level: 'error',
      field: 'version',
      message: `version di manifest (${value.version}) berbeda dengan versi npm yang didaftarkan (${expected.packageVersion}).`,
    });
  }

  if (value.rendererApiVersion !== RENDERER_API_VERSION) {
    issues.push({
      code: 'renderer_api_unsupported',
      level: 'error',
      field: 'rendererApiVersion',
      message: `rendererApiVersion harus ${RENDERER_API_VERSION}.`,
    });
  }

  if ('isBuiltin' in value) {
    issues.push({
      code: 'is_builtin_ignored',
      level: 'warning',
      field: 'isBuiltin',
      message: 'isBuiltin diisi otomatis oleh Bagdja; hapus dari manifest.',
    });
  }

  const businessProfiles = checkStringList<BusinessProfileId>(
    value.businessProfiles,
    'businessProfiles',
    SELECTABLE_BUSINESS_PROFILE_IDS,
    issues,
    {
      required: true,
      unknownCode: 'business_profile_unknown',
      unknownMessage: (item) => `Jenis bisnis "${item}" tidak dikenal.`,
    },
  );

  const capabilities = checkStringList<TemplateCapability>(
    value.capabilities,
    'capabilities',
    TEMPLATE_CAPABILITIES,
    issues,
    {
      required: false,
      unknownCode: 'capability_unknown',
      unknownMessage: (item) =>
        LEGACY_CAPABILITIES[item]
          ? `Capability "${item}" sudah tidak dipakai. ${LEGACY_CAPABILITIES[item]}`
          : `Capability "${item}" tidak dikenal. Pilihan: ${TEMPLATE_CAPABILITIES.join(', ')}.`,
    },
  );

  const sectionTypes: string[] = [];
  if (!Array.isArray(value.sections) || value.sections.length === 0) {
    issues.push({
      code: 'sections_invalid',
      level: 'error',
      field: 'sections',
      message: 'sections wajib berupa daftar dan tidak boleh kosong.',
    });
  } else {
    value.sections.forEach((item, index) => {
      if (typeof item !== 'string' || !getSectionSchema(item)) {
        issues.push({
          code: 'section_unknown',
          level: 'error',
          field: `sections[${index}]`,
          message: `Section "${String(item)}" tidak ada di katalog section Bagdja.`,
        });
        return;
      }
      if (sectionTypes.includes(item)) {
        issues.push({
          code: 'sections_duplicate',
          level: 'warning',
          field: `sections[${index}]`,
          message: `"${item}" tercantum lebih dari sekali.`,
        });
        return;
      }
      sectionTypes.push(item);
    });
  }

  const pageOverrides = checkStringList<TemplatePageOverride>(
    value.pageOverrides,
    'pageOverrides',
    TEMPLATE_PAGE_OVERRIDES,
    issues,
    {
      required: false,
      unknownCode: 'page_override_unknown',
      unknownMessage: (item) =>
        `Halaman "${item}" tidak bisa dirender template. Pilihan: ${TEMPLATE_PAGE_OVERRIDES.join(', ')}.`,
    },
  );

  let hasClientEntry = false;
  if (!isRecord(value.entry) || value.entry.server !== EXTERNAL_SERVER_ENTRY) {
    issues.push({
      code: 'entry_server_invalid',
      level: 'error',
      field: 'entry.server',
      message: `entry.server harus "${EXTERNAL_SERVER_ENTRY}".`,
    });
  }
  if (isRecord(value.entry) && value.entry.client !== undefined) {
    if (value.entry.client !== EXTERNAL_CLIENT_ENTRY) {
      issues.push({
        code: 'entry_client_invalid',
        level: 'error',
        field: 'entry.client',
        message: `entry.client harus "${EXTERNAL_CLIENT_ENTRY}" atau dihapus.`,
      });
    } else {
      hasClientEntry = true;
    }
  }

  const defaultPages = checkDefaultPages(value.defaultPages, sectionTypes, issues);

  let preview: ExternalTemplatePackageManifest['preview'];
  if (value.preview !== undefined) {
    const imageUrl = isRecord(value.preview) ? value.preview.imageUrl : undefined;
    if (
      !isRecord(value.preview) ||
      (imageUrl !== undefined && (typeof imageUrl !== 'string' || !imageUrl.startsWith('https://')))
    ) {
      issues.push({
        code: 'preview_invalid',
        level: 'error',
        field: 'preview.imageUrl',
        message: 'preview.imageUrl harus URL https.',
      });
    } else if (typeof imageUrl === 'string') {
      preview = { imageUrl };
    }
  }

  if (issues.some((issue) => issue.level === 'error')) {
    return { manifest: null, issues };
  }

  const manifest: ExternalTemplatePackageManifest = {
    manifestVersion: EXTERNAL_MANIFEST_VERSION,
    slug: value.slug as string,
    name: (value.name as string).trim(),
    version: value.version as string,
    rendererApiVersion: RENDERER_API_VERSION,
    businessProfiles,
    capabilities,
    sections: sectionTypes,
    ...(pageOverrides.length ? { pageOverrides } : {}),
    entry: hasClientEntry
      ? { server: EXTERNAL_SERVER_ENTRY, client: EXTERNAL_CLIENT_ENTRY }
      : { server: EXTERNAL_SERVER_ENTRY },
    ...(defaultPages ? { defaultPages } : {}),
    ...(preview ? { preview } : {}),
  };
  return { manifest, issues };
}

/** Bentuk yang disimpan di `website_templates.manifest` / `website_template_version.manifest`. */
export function toCatalogTemplateManifest(
  manifest: ExternalTemplatePackageManifest,
): TemplateManifest {
  return {
    slug: manifest.slug,
    name: manifest.name,
    version: manifest.version,
    rendererApiVersion: RENDERER_API_VERSION,
    isBuiltin: false,
    businessProfiles: [...manifest.businessProfiles],
    capabilities: [...manifest.capabilities],
    sections: [...manifest.sections],
    ...(manifest.preview ? { preview: { ...manifest.preview } } : {}),
  };
}

/**
 * `defaultPages` → format `website_templates.structure` yang dibaca
 * `WebsiteBootstrapService` (Home = `sections`, halaman lain = `extra_pages`).
 */
export function toBootstrapStructure(
  manifest: ExternalTemplatePackageManifest,
): Record<string, unknown> {
  if (!manifest.defaultPages?.length) return {};
  const toSections = (page: ExternalTemplateDefaultPage) =>
    page.sections.map((section) => ({ type: section.type, defaults: section.content }));
  const home = manifest.defaultPages.find((page) => page.isHome);
  return {
    sections: home ? toSections(home) : [],
    extra_pages: manifest.defaultPages
      .filter((page) => !page.isHome)
      .map((page) => ({ slug: page.slug, title: page.title, sections: toSections(page) })),
  };
}

const SEMVER_PARTS = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

/** Bandingkan dua semver exact (build metadata diabaikan). Negatif bila a < b. */
export function compareSemver(a: string, b: string): number {
  const left = SEMVER_PARTS.exec(a);
  const right = SEMVER_PARTS.exec(b);
  if (!left || !right) throw new Error(`Invalid semver: ${!left ? a : b}`);
  for (let index = 1; index <= 3; index += 1) {
    const diff = Number(left[index]) - Number(right[index]);
    if (diff !== 0) return diff;
  }
  const leftPre = left[4];
  const rightPre = right[4];
  if (!leftPre && !rightPre) return 0;
  if (!leftPre) return 1;
  if (!rightPre) return -1;
  const leftIds = leftPre.split('.');
  const rightIds = rightPre.split('.');
  for (let index = 0; index < Math.max(leftIds.length, rightIds.length); index += 1) {
    const l = leftIds[index];
    const r = rightIds[index];
    if (l === undefined) return -1;
    if (r === undefined) return 1;
    const lNum = /^\d+$/.test(l);
    const rNum = /^\d+$/.test(r);
    if (lNum && rNum && Number(l) !== Number(r)) return Number(l) - Number(r);
    if (lNum !== rNum) return lNum ? -1 : 1;
    if (l !== r) return l < r ? -1 : 1;
  }
  return 0;
}
