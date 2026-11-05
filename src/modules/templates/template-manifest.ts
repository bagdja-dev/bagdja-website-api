/**
 * R1 — manifest template (template-contract.md §3).
 *
 * Manifest disimpan di `website_templates.manifest` (SQL
 * 20261105000003_website_templates_builtin_manifest.sql). Konstanta
 * `BUILTIN_TEMPLATE_MANIFESTS` di bawah adalah salinan acuan untuk tiga
 * template bawaan, diturunkan dari inventaris R0 (template-contract.md §5),
 * dan diuji sama persis dengan isi SQL agar tidak menyimpang.
 */
import { BUSINESS_PROFILE_IDS, type BusinessProfileId } from '../websites/business-profile.registry';

import type { SectionSchema } from './section-schema.registry';

export const TEMPLATE_CAPABILITIES = [
  'catalog',
  'cart',
  'checkout',
  'orders',
  'blog',
  'faq',
  'locations',
  'gathering',
  'buyer_auth',
  'chat',
  'digital_delivery',
] as const;

export type TemplateCapability = (typeof TEMPLATE_CAPABILITIES)[number];

export const RENDERER_API_VERSION = 1;

export interface TemplateManifestPreview {
  imageUrl?: string;
  demoPath?: string;
}

export interface TemplateManifest {
  slug: string;
  name: string;
  version: string;
  rendererApiVersion: 1;
  isBuiltin: boolean;
  businessProfiles: BusinessProfileId[];
  capabilities: TemplateCapability[];
  sections: string[];
  preview?: TemplateManifestPreview;
}

export interface TemplateManifestResponse extends TemplateManifest {
  sectionSchemas: SectionSchema[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item): item is string => typeof item === 'string');
}

export function isTemplateManifest(value: unknown): value is TemplateManifest {
  if (!isRecord(value)) return false;

  const businessProfileIds: readonly string[] = BUSINESS_PROFILE_IDS;
  const capabilities: readonly string[] = TEMPLATE_CAPABILITIES;
  const previewIsValid =
    value.preview === undefined ||
    (isRecord(value.preview) &&
      (value.preview.imageUrl === undefined || typeof value.preview.imageUrl === 'string') &&
      (value.preview.demoPath === undefined || typeof value.preview.demoPath === 'string'));

  return (
    typeof value.slug === 'string' &&
    typeof value.name === 'string' &&
    typeof value.version === 'string' &&
    value.rendererApiVersion === RENDERER_API_VERSION &&
    typeof value.isBuiltin === 'boolean' &&
    isStringArray(value.businessProfiles) &&
    value.businessProfiles.every((id) => businessProfileIds.includes(id)) &&
    isStringArray(value.capabilities) &&
    value.capabilities.every((capability) => capabilities.includes(capability)) &&
    isStringArray(value.sections) &&
    previewIsValid
  );
}

export const BUILTIN_TEMPLATE_MANIFESTS: readonly TemplateManifest[] = [
  {
    slug: 'barber-classic',
    name: 'Barber Classic',
    version: '1.0.0',
    rendererApiVersion: 1,
    isBuiltin: true,
    businessProfiles: ['service_business', 'company_profile'],
    // R0: cart/checkout hanya lewat halaman keranjang & CartBadge (tanpa tombol beli di kartu produk).
    capabilities: [...TEMPLATE_CAPABILITIES],
    // R0: `hero` tidak dirender visual (JSX dikomentari; hanya show_whatsapp_cta dibaca header) → tidak dideklarasikan.
    sections: [
      'text_block',
      'rich_text',
      'about',
      'gallery',
      'testimonial',
      'services_grid',
      'products_grid',
      'category_grid',
      'cta',
      'contact',
      'locations_list',
      'faq_list',
      'blog_list',
      'blog_search',
      'blog_collection',
    ],
  },
  {
    slug: 'store-classic',
    name: 'Store Classic',
    version: '1.0.0',
    rendererApiVersion: 1,
    isBuiltin: true,
    businessProfiles: ['online_store', 'digital_goods'],
    capabilities: [...TEMPLATE_CAPABILITIES],
    sections: [
      'hero',
      'text_block',
      'rich_text',
      'about',
      'gallery',
      'features_grid',
      'logo_wall',
      'testimonial',
      'services_grid',
      'products_grid',
      'category_grid',
      'featured_product',
      'cta',
      'contact',
      'locations_list',
      'faq_list',
      'blog_list',
      'blog_search',
      'blog_collection',
    ],
  },
  {
    slug: 'workshop',
    name: 'Workshop',
    version: '1.0.0',
    rendererApiVersion: 1,
    isBuiltin: true,
    businessProfiles: ['service_business', 'project_quotation'],
    // R0: tanpa `locations` (hanya lokasi utama di kontak/footer/checkout, tidak ada locations_list).
    capabilities: ['catalog', 'cart', 'checkout', 'orders', 'blog', 'faq', 'gathering', 'buyer_auth', 'chat', 'digital_delivery'],
    sections: [
      'hero',
      'about',
      'gallery',
      'features_grid',
      'testimonial',
      'services_grid',
      'category_grid',
      'service_process_section',
      'contact',
      'faq_list',
      'blog_list',
      'blog_search',
      'blog_collection',
    ],
  },
];
