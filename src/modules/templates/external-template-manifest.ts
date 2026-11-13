/**
 * Manifest package template eksternal (plan/website-builder/
 * template-submission-review-publication-flow.md §6).
 *
 * `manifest.json` di root tarball npm memakai kosakata yang sama dengan
 * `TemplateManifest` API, sehingga hasil "Cek package" dapat dipakai langsung
 * tanpa ditulis ulang oleh reviewer. Fungsi di file ini murni (tanpa I/O);
 * kepemilikan slug oleh package lain dicek di service karena butuh database.
 */
import { isGoogleMapsUrl } from '../../common/google-maps-url';
import {
  sanitizeWebsiteTheme,
  THEME_COLOR_KEYS,
  type WebsiteTheme,
} from '../../common/website-theme';
import {
  SELECTABLE_BUSINESS_PROFILE_IDS,
  type BusinessProfileId,
} from '../websites/business-profile.registry';

import { normalizeGatheringCancellationPolicy } from '../products/gathering-product-options.validation';
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
  'bottom_nav',
  'cart',
  'orders',
  'order_detail',
  'tagihan',
  'invoice_detail',
  'calendar',
  'gathering_plan',
  'product_detail',
  'gathering_invitation',
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

/** Data contoh website baru (plan/website-builder/template-sample-data-plan.md §3). */
export const SAMPLE_PRODUCT_TYPES = ['product', 'service', 'gathering'] as const;
export const MAX_SAMPLE_CATEGORIES = 20;
export const MAX_SAMPLE_PRODUCTS = 30;
export const MAX_SAMPLE_FAQS = 30;
export const MAX_SAMPLE_IMAGES = 5;
/** Paket/pilihan per produk gathering contoh. */
export const MAX_SAMPLE_OPTIONS = 30;
export const MAX_SAMPLE_OPTION_BENEFITS = 10;
/** Deskripsi boleh HTML ringan (disanitasi saat seed, sama seperti simpan dari Studio). */
export const MAX_SAMPLE_DESCRIPTION_LENGTH = 5000;
export const MAX_SAMPLE_DETAIL_LENGTH = 20_000;

/** Kebijakan pembatalan gathering contoh (camelCase manifest → `cancellation_policy` produk & paket). */
export interface ExternalTemplateSampleCancellationPolicy {
  penaltyType?: 'NONE' | 'FIXED' | 'PERCENTAGE';
  penaltyValue?: number;
  cutoffDaysBeforeEvent?: number;
  prepareDaysBeforeEvent?: number;
  /** HTML ringan. */
  summary?: string;
  /** HTML ringan. */
  participantTerms?: string;
}

/** Paket/pilihan gathering contoh → `website_event_product_options`. Harga, DP, kuota & kebijakan mengikuti produk. */
export interface ExternalTemplateSampleOption {
  group: string;
  key: string;
  label: string;
  /** HTML ringan (profil `basic`). */
  description?: string;
  venue?: string;
  address?: string;
  mapUrl?: string;
  benefits?: string[];
  images?: string[];
  availabilityNote?: string;
}

export interface ExternalTemplateSampleProduct {
  name: string;
  type: (typeof SAMPLE_PRODUCT_TYPES)[number];
  price: number;
  description?: string;
  category?: string;
  images?: string[];
  durationMinutes?: number;
  minAttendees?: number;
  maxAttendees?: number;
  /** HTML (profil `product`). */
  detail?: string;
  depositPerSeat?: number;
  cancellationPolicy?: ExternalTemplateSampleCancellationPolicy;
  options?: ExternalTemplateSampleOption[];
}

export interface ExternalTemplateSampleData {
  tagline?: string;
  categories?: Array<{ label: string; imageUrl?: string }>;
  products?: ExternalTemplateSampleProduct[];
  faqs?: Array<{ question: string; answer: string; category?: string }>;
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
  theme?: WebsiteTheme;
  defaultPages?: ExternalTemplateDefaultPage[];
  preview?: { imageUrl?: string };
  sampleData?: ExternalTemplateSampleData;
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

function checkTemplateTheme(value: unknown, issues: ManifestCheckIssue[]): WebsiteTheme | undefined {
  if (value === undefined) return undefined;
  const fail = (field: string, message: string) => {
    issues.push({ code: 'theme_invalid', level: 'error', field, message });
  };
  if (!isRecord(value)) {
    fail('theme', 'theme harus berupa objek.');
    return undefined;
  }
  if (value.mode !== undefined && value.mode !== 'light' && value.mode !== 'dark') {
    fail('theme.mode', 'mode harus "light" atau "dark".');
  }
  if (value.preset !== undefined && !['light', 'dark', 'custom'].includes(String(value.preset))) {
    fail('theme.preset', 'preset harus "light", "dark", atau "custom".');
  }
  if (
    value.accent !== undefined &&
    !['amber', 'blue', 'emerald', 'rose', 'violet', 'indigo', 'orange', 'teal'].includes(String(value.accent))
  ) {
    fail('theme.accent', 'accent harus berupa nama aksen yang didukung.');
  }
  if (value.colors !== undefined) {
    if (!isRecord(value.colors)) {
      fail('theme.colors', 'colors harus berupa objek warna.');
    } else {
      for (const [key, color] of Object.entries(value.colors)) {
        if (!(THEME_COLOR_KEYS as readonly string[]).includes(key) || typeof color !== 'string' || !/^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(color)) {
          fail(`theme.colors.${key}`, 'Warna harus memakai token warna yang didukung dan nilai hex #RGB atau #RRGGBB.');
        }
      }
    }
  }
  return issues.some((issue) => issue.code === 'theme_invalid') ? undefined : sanitizeWebsiteTheme(value);
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

function boundedText(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.trim() && value.trim().length <= max ? value.trim() : null;
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 1000) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

const SAMPLE_OPTION_KEY = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/** Kebijakan pembatalan contoh: aturan sama dengan simpan produk gathering di Studio. */
function checkSampleCancellationPolicy(value: unknown, price: number): ExternalTemplateSampleCancellationPolicy | string {
  if (!isRecord(value)) return 'cancellationPolicy harus berupa objek.';
  const policy: ExternalTemplateSampleCancellationPolicy = {};
  for (const key of ['summary', 'participantTerms'] as const) {
    if (value[key] === undefined) continue;
    const html = boundedText(value[key], MAX_SAMPLE_DETAIL_LENGTH);
    if (!html) return `${key} maks. ${MAX_SAMPLE_DETAIL_LENGTH} karakter (boleh HTML).`;
    policy[key] = html;
  }
  if (value.penaltyType !== undefined) policy.penaltyType = value.penaltyType as ExternalTemplateSampleCancellationPolicy['penaltyType'];
  for (const key of ['penaltyValue', 'cutoffDaysBeforeEvent', 'prepareDaysBeforeEvent'] as const) {
    if (value[key] !== undefined) policy[key] = value[key] as number;
  }
  try {
    normalizeGatheringCancellationPolicy(toCancellationPolicyRecord(policy), price);
  } catch (error) {
    return error instanceof Error ? error.message : 'cancellationPolicy tidak valid.';
  }
  return policy;
}

/** camelCase manifest → bentuk `cancellation_policy` API (dinormalisasi lagi saat seed). */
export function toCancellationPolicyRecord(policy: ExternalTemplateSampleCancellationPolicy): Record<string, unknown> {
  return {
    ...(policy.penaltyType !== undefined ? { penalty_type: policy.penaltyType } : {}),
    ...(policy.penaltyValue !== undefined ? { penalty_value: policy.penaltyValue } : {}),
    ...(policy.cutoffDaysBeforeEvent !== undefined ? { cutoff_days_before_event: policy.cutoffDaysBeforeEvent } : {}),
    ...(policy.prepareDaysBeforeEvent !== undefined ? { prepare_days_before_event: policy.prepareDaysBeforeEvent } : {}),
    ...(policy.summary ? { summary: policy.summary } : {}),
    ...(policy.participantTerms ? { participant_terms: policy.participantTerms } : {}),
  };
}

function checkSampleOptions(
  value: unknown,
  field: string,
  fail: (field: string, message: string) => void,
): ExternalTemplateSampleOption[] | null {
  if (!Array.isArray(value) || value.length > MAX_SAMPLE_OPTIONS) {
    fail(field, `options harus berupa daftar (maks. ${MAX_SAMPLE_OPTIONS}).`);
    return null;
  }
  const keys = new Set<string>();
  const options: ExternalTemplateSampleOption[] = [];
  for (const [index, item] of value.entries()) {
    const at = `${field}[${index}]`;
    if (!isRecord(item)) return fail(at, 'Paket contoh harus berupa objek.'), null;
    const group = typeof item.group === 'string' && SAMPLE_OPTION_KEY.test(item.group) ? item.group : null;
    const key = typeof item.key === 'string' && SAMPLE_OPTION_KEY.test(item.key) ? item.key : null;
    const label = boundedText(item.label, 255);
    if (!group || !key || !label) {
      return fail(at, 'Paket butuh group & key (huruf kecil, angka, - atau _, maks. 64) dan label (≤255).'), null;
    }
    if (keys.has(`${group}:${key}`)) return fail(at, `key "${key}" sudah dipakai di group "${group}".`), null;
    keys.add(`${group}:${key}`);
    const option: ExternalTemplateSampleOption = { group, key, label };
    if (item.description !== undefined) {
      const description = boundedText(item.description, MAX_SAMPLE_DESCRIPTION_LENGTH);
      if (!description) return fail(`${at}.description`, `description maks. ${MAX_SAMPLE_DESCRIPTION_LENGTH} karakter (boleh HTML).`), null;
      option.description = description;
    }
    for (const [name, max] of [['venue', 255], ['address', 500], ['availabilityNote', 255]] as const) {
      if (item[name] === undefined) continue;
      const text = boundedText(item[name], max);
      if (!text) return fail(`${at}.${name}`, `${name} maks. ${max} karakter.`), null;
      option[name] = text;
    }
    if (item.mapUrl !== undefined) {
      if (!isGoogleMapsUrl(item.mapUrl)) return fail(`${at}.mapUrl`, 'mapUrl harus tautan Google Maps https.'), null;
      option.mapUrl = item.mapUrl.trim();
    }
    if (item.benefits !== undefined) {
      if (
        !Array.isArray(item.benefits) || item.benefits.length > MAX_SAMPLE_OPTION_BENEFITS ||
        !item.benefits.every((benefit) => boundedText(benefit, 200))
      ) {
        return fail(`${at}.benefits`, `benefits berisi maks. ${MAX_SAMPLE_OPTION_BENEFITS} teks (≤200).`), null;
      }
      option.benefits = item.benefits.map((benefit) => String(benefit).trim());
    }
    if (item.images !== undefined) {
      if (!Array.isArray(item.images) || item.images.length > MAX_SAMPLE_IMAGES || !item.images.every(isHttpsUrl)) {
        return fail(`${at}.images`, `images berisi maks. ${MAX_SAMPLE_IMAGES} URL https.`), null;
      }
      option.images = [...item.images];
    }
    options.push(option);
  }
  return options;
}

/** `sampleData` opsional: kategori, produk/jasa/gathering, FAQ contoh untuk website baru. */
function checkSampleData(value: unknown, issues: ManifestCheckIssue[]): ExternalTemplateSampleData | undefined {
  if (value === undefined) return undefined;
  const fail = (field: string, message: string) => {
    issues.push({ code: 'sample_data_invalid', level: 'error', field, message });
  };
  if (!isRecord(value)) {
    fail('sampleData', 'sampleData harus berupa objek.');
    return undefined;
  }
  const result: ExternalTemplateSampleData = {};

  if (value.tagline !== undefined) {
    const tagline = boundedText(value.tagline, 200);
    if (tagline) result.tagline = tagline;
    else fail('sampleData.tagline', 'tagline harus teks 1–200 karakter.');
  }

  const listOf = (key: 'categories' | 'products' | 'faqs', max: number): unknown[] => {
    const list = value[key];
    if (list === undefined) return [];
    if (!Array.isArray(list) || list.length > max) {
      fail(`sampleData.${key}`, `${key} harus berupa daftar (maks. ${max}).`);
      return [];
    }
    return list;
  };

  const categories = listOf('categories', MAX_SAMPLE_CATEGORIES).flatMap((item, index) => {
    const field = `sampleData.categories[${index}]`;
    const label = isRecord(item) ? boundedText(item.label, 80) : null;
    if (!label) {
      fail(field, 'Kategori butuh label 1–80 karakter.');
      return [];
    }
    if (isRecord(item) && item.imageUrl !== undefined && !isHttpsUrl(item.imageUrl)) {
      fail(`${field}.imageUrl`, 'imageUrl harus URL https.');
      return [];
    }
    return [{ label, ...(isRecord(item) && isHttpsUrl(item.imageUrl) ? { imageUrl: item.imageUrl } : {}) }];
  });
  if (categories.length) result.categories = categories;

  const products = listOf('products', MAX_SAMPLE_PRODUCTS).flatMap((item, index) => {
    const field = `sampleData.products[${index}]`;
    if (!isRecord(item)) {
      fail(field, 'Produk contoh harus berupa objek.');
      return [];
    }
    const name = boundedText(item.name, 150);
    const type = SAMPLE_PRODUCT_TYPES.find((candidate) => candidate === item.type);
    const price = item.price;
    if (!name || !type || typeof price !== 'number' || !Number.isInteger(price) || price < 0 || price > 10_000_000_000) {
      fail(field, `Produk contoh butuh name (≤150), type (${SAMPLE_PRODUCT_TYPES.join('/')}), dan price bilangan bulat ≥ 0.`);
      return [];
    }
    const product: ExternalTemplateSampleProduct = { name, type, price };
    if (item.description !== undefined) {
      const description = boundedText(item.description, MAX_SAMPLE_DESCRIPTION_LENGTH);
      if (!description) return fail(`${field}.description`, `description maks. ${MAX_SAMPLE_DESCRIPTION_LENGTH} karakter (boleh HTML).`), [];
      product.description = description;
    }
    if (item.detail !== undefined) {
      const detail = boundedText(item.detail, MAX_SAMPLE_DETAIL_LENGTH);
      if (!detail) return fail(`${field}.detail`, `detail maks. ${MAX_SAMPLE_DETAIL_LENGTH} karakter (boleh HTML).`), [];
      product.detail = detail;
    }
    if (item.category !== undefined) {
      const category = boundedText(item.category, 80);
      if (!category) return fail(`${field}.category`, 'category maks. 80 karakter.'), [];
      product.category = category;
    }
    if (item.images !== undefined) {
      if (!Array.isArray(item.images) || item.images.length > MAX_SAMPLE_IMAGES || !item.images.every(isHttpsUrl)) {
        return fail(`${field}.images`, `images berisi maks. ${MAX_SAMPLE_IMAGES} URL https.`), [];
      }
      product.images = [...item.images];
    }
    if (type === 'service' && item.durationMinutes !== undefined) {
      const minutes = item.durationMinutes;
      if (typeof minutes !== 'number' || !Number.isInteger(minutes) || minutes < 1 || minutes > 10_080) {
        return fail(`${field}.durationMinutes`, 'durationMinutes bilangan bulat 1–10080.'), [];
      }
      product.durationMinutes = minutes;
    }
    if (type === 'gathering') {
      const min = item.minAttendees;
      const max = item.maxAttendees;
      if (
        typeof min !== 'number' || typeof max !== 'number' ||
        !Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < 1 || min > max || max > 10_000
      ) {
        return fail(field, 'Gathering contoh butuh minAttendees ≤ maxAttendees (bilangan bulat, maks. 10000).'), [];
      }
      product.minAttendees = min;
      product.maxAttendees = max;
      if (item.depositPerSeat !== undefined) {
        const deposit = item.depositPerSeat;
        if (typeof deposit !== 'number' || !Number.isInteger(deposit) || deposit < 0 || deposit > price) {
          return fail(`${field}.depositPerSeat`, 'depositPerSeat bilangan bulat 0 sampai harga per kursi.'), [];
        }
        product.depositPerSeat = deposit;
      }
      if (item.cancellationPolicy !== undefined) {
        const policy = checkSampleCancellationPolicy(item.cancellationPolicy, price);
        if (typeof policy === 'string') return fail(`${field}.cancellationPolicy`, policy), [];
        product.cancellationPolicy = policy;
      }
      if (item.options !== undefined) {
        const options = checkSampleOptions(item.options, `${field}.options`, fail);
        if (!options) return [];
        product.options = options;
      }
    } else if (item.depositPerSeat !== undefined || item.cancellationPolicy !== undefined || item.options !== undefined) {
      return fail(field, 'depositPerSeat, cancellationPolicy, dan options hanya untuk type gathering.'), [];
    }
    return [product];
  });
  if (products.length) result.products = products;

  const faqs = listOf('faqs', MAX_SAMPLE_FAQS).flatMap((item, index) => {
    const field = `sampleData.faqs[${index}]`;
    const question = isRecord(item) ? boundedText(item.question, 300) : null;
    const answer = isRecord(item) ? boundedText(item.answer, 2000) : null;
    if (!question || !answer) {
      fail(field, 'FAQ contoh butuh question (≤300) dan answer (≤2000).');
      return [];
    }
    const category = isRecord(item) && item.category !== undefined ? boundedText(item.category, 50) : undefined;
    if (category === null) return fail(`${field}.category`, 'category FAQ maks. 50 karakter.'), [];
    return [{ question, answer, ...(category ? { category } : {}) }];
  });
  if (faqs.length) result.faqs = faqs;

  return Object.keys(result).length ? result : undefined;
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
  const theme = checkTemplateTheme(value.theme, issues);

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

  const sampleData = checkSampleData(value.sampleData, issues);

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
    ...(theme ? { theme } : {}),
    ...(defaultPages ? { defaultPages } : {}),
    ...(preview ? { preview } : {}),
    ...(sampleData ? { sampleData } : {}),
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
  const structure: Record<string, unknown> = {};
  if (manifest.theme) structure.theme = manifest.theme;
  if (manifest.defaultPages?.length) {
    const toSections = (page: ExternalTemplateDefaultPage) =>
      page.sections.map((section) => ({ type: section.type, defaults: section.content }));
    const home = manifest.defaultPages.find((page) => page.isHome);
    structure.sections = home ? toSections(home) : [];
    structure.extra_pages = manifest.defaultPages
      .filter((page) => !page.isHome)
      .map((page) => ({ slug: page.slug, title: page.title, sections: toSections(page) }));
  }
  const masterDefaults = toMasterDefaults(manifest.sampleData);
  if (masterDefaults) structure.master_defaults = masterDefaults;
  return structure;
}

/** `sampleData` → `master_defaults` yang dibaca WebsiteBootstrapService (format template bawaan). */
export function toMasterDefaults(sample: ExternalTemplateSampleData | undefined): Record<string, unknown> | null {
  if (!sample) return null;
  const item = (product: ExternalTemplateSampleProduct) => ({
    name: product.name,
    price: product.price,
    ...(product.description ? { description: product.description } : {}),
    ...(product.category ? { category: product.category } : {}),
    ...(product.images?.length ? { images: product.images } : {}),
    ...(product.durationMinutes ? { duration_minutes: product.durationMinutes } : {}),
    ...(product.type === 'gathering' ? { min_attendees: product.minAttendees, max_attendees: product.maxAttendees } : {}),
    ...(product.detail ? { detail: product.detail } : {}),
    ...(product.depositPerSeat !== undefined ? { deposit_amount_per_seat: product.depositPerSeat } : {}),
    ...(product.cancellationPolicy ? { cancellation_policy: toCancellationPolicyRecord(product.cancellationPolicy) } : {}),
    ...(product.options?.length
      ? {
        options: product.options.map((option) => ({
          option_group_key: option.group,
          option_key: option.key,
          label: option.label,
          ...(option.description ? { description: option.description } : {}),
          ...(option.venue ? { venue_location: option.venue } : {}),
          ...(option.address ? { venue_address: option.address } : {}),
          ...(option.mapUrl ? { venue_map_url: option.mapUrl } : {}),
          ...(option.benefits?.length ? { benefits: option.benefits } : {}),
          ...(option.images?.length ? { images: option.images } : {}),
          ...(option.availabilityNote ? { availability_window: { note: option.availabilityNote } } : {}),
        })),
      }
      : {}),
  });
  const products = sample.products ?? [];
  const defaults: Record<string, unknown> = {
    ...(sample.tagline ? { tagline: sample.tagline } : {}),
    ...(sample.categories?.length
      ? { categories: sample.categories.map((category) => ({ label: category.label, images: category.imageUrl ? [category.imageUrl] : [] })) }
      : {}),
    ...(products.some((product) => product.type === 'product')
      ? { products: products.filter((product) => product.type === 'product').map(item) }
      : {}),
    ...(products.some((product) => product.type === 'service')
      ? { services: products.filter((product) => product.type === 'service').map(item) }
      : {}),
    ...(products.some((product) => product.type === 'gathering')
      ? { gatherings: products.filter((product) => product.type === 'gathering').map(item) }
      : {}),
    ...(sample.faqs?.length ? { faqs: sample.faqs } : {}),
  };
  return Object.keys(defaults).length ? defaults : null;
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
