import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { sanitizeRichText } from '../../common/rich-text';
import { extractTemplateTheme } from '../../common/website-theme';
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
import { normalizeGatheringCancellationPolicy } from '../products/gathering-product-options.validation';

interface TemplateSectionDef {
  type: string;
  defaults?: Record<string, unknown>;
}

/** Halaman tambahan selain Home (mis. FAQ) — `structure.sections` tetap khusus Home. */
interface TemplateExtraPageDef {
  slug: string;
  title: string;
  placement?: string;
  sections?: TemplateSectionDef[];
}

interface CatalogSeedItem {
  key?: string;
  parent_key?: string;
  name: string;
  price: number;
  category?: string;
  description?: string;
  duration_minutes?: number;
  /** Produk gathering (template package, template-sample-data-plan.md). */
  min_attendees?: number;
  max_attendees?: number;
  images?: string[];
  image?: string;
  sku?: string;
  variant_attributes?: Record<string, string>;
  inherit_description?: boolean;
  /** HTML (profil `product`, disanitasi saat seed). */
  detail?: string;
  /** Gathering: DP per kursi & kebijakan pembatalan (dipakai produk + semua paketnya). */
  deposit_amount_per_seat?: number;
  cancellation_policy?: Record<string, unknown>;
  /** Gathering: paket/pilihan → `website_event_product_options`. */
  options?: GatheringOptionSeedItem[];
}

interface GatheringOptionSeedItem {
  option_group_key: string;
  option_key: string;
  label: string;
  /** HTML (profil `basic`). */
  description?: string;
  venue_location?: string;
  venue_address?: string;
  venue_map_url?: string;
  benefits?: string[];
  images?: string[];
  availability_window?: Record<string, unknown>;
}

interface CategorySeedItem {
  label: string;
  images?: string[];
}

interface MasterDefaults {
  tagline?: string;
  categories?: CategorySeedItem[];
  services?: CatalogSeedItem[];
  products?: CatalogSeedItem[];
  gatherings?: CatalogSeedItem[];
  faqs?: Array<{
    question: string;
    answer: string;
    category?: string;
  }>;
  location?: {
    name?: string;
    type?: string;
    address_line?: string;
    city?: string;
    opening_hours?: Record<string, unknown>;
  };
}

function resolveSeedImages(item: CatalogSeedItem): string[] {
  if (item.images?.length) return item.images;
  if (item.image) return [item.image];
  return [];
}

type SeedProductType = 'service' | 'product' | 'gathering';

/** Kebijakan pembatalan gathering contoh, dinormalisasi sama seperti simpan dari Studio (HTML disanitasi). */
export function buildSeedCancellationPolicy(item: CatalogSeedItem): Record<string, unknown> | null {
  if (!item.cancellation_policy) return null;
  const policy = normalizeGatheringCancellationPolicy(item.cancellation_policy, item.price);
  for (const key of ['summary', 'participant_terms'] as const) {
    if (typeof policy[key] !== 'string') continue;
    const clean = sanitizeRichText(policy[key] as string, 'product');
    if (clean) policy[key] = clean;
    else delete policy[key];
  }
  return policy;
}

export function buildSeedProductMetadata(
  item: CatalogSeedItem,
  type: SeedProductType,
): Record<string, unknown> {
  const cancellationPolicy = type === 'gathering' ? buildSeedCancellationPolicy(item) : null;
  return {
    is_seed: true,
    ...(type === 'gathering'
      ? {
        min_attendees: item.min_attendees ?? 0,
        max_attendees: item.max_attendees ?? 1,
        ...(item.deposit_amount_per_seat !== undefined ? { deposit_amount_per_seat: item.deposit_amount_per_seat } : {}),
        ...(cancellationPolicy ? { cancellation_policy: cancellationPolicy } : {}),
      }
      : {}),
    ...(item.sku ? { sku: item.sku } : {}),
    ...(type === 'service'
      ? { ...(item.duration_minutes != null ? { duration_minutes: item.duration_minutes } : {}) }
      : {}),
    ...(item.variant_attributes ? { variant_attributes: item.variant_attributes } : {}),
    ...(item.inherit_description ? { inherit_description: true } : {}),
  };
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

@Injectable()
export class WebsiteBootstrapService {
  private readonly logger = new Logger(WebsiteBootstrapService.name);

  constructor(
    @InjectRepository(WebsiteTemplate)
    private readonly templateRepo: Repository<WebsiteTemplate>,
    @InjectRepository(WebsitePage)
    private readonly pageRepo: Repository<WebsitePage>,
    @InjectRepository(WebsiteSection)
    private readonly sectionRepo: Repository<WebsiteSection>,
    @InjectRepository(WebsiteLocation)
    private readonly locationRepo: Repository<WebsiteLocation>,
    @InjectRepository(WebsiteProduct)
    private readonly productRepo: Repository<WebsiteProduct>,
    @InjectRepository(WebsiteFaq)
    private readonly faqRepo: Repository<WebsiteFaq>,
    @InjectRepository(WebsiteCategory)
    private readonly categoryRepo: Repository<WebsiteCategory>,
    @InjectRepository(Website)
    private readonly websiteRepo: Repository<Website>,
    @InjectRepository(WebsiteEventProductOption)
    private readonly optionRepo: Repository<WebsiteEventProductOption>,
  ) {}

  async bootstrap(
    website: Website,
    templateId: string | null,
    structureOverride?: Record<string, unknown>,
  ): Promise<void> {
    const structure = structureOverride ?? (templateId
      ? (await this.templateRepo.findOne({ where: { id: templateId } }))?.structure
      : null);

    const themeDefaults = extractTemplateTheme(structure ?? null);
    if (Object.keys(website.theme ?? {}).length === 0 && Object.keys(themeDefaults).length > 0) {
      website.theme = themeDefaults as Record<string, unknown>;
      await this.websiteRepo.save(website);
    }

    const sections = (structure?.sections as TemplateSectionDef[] | undefined) ?? [];
    const extraPages = (structure?.extra_pages as TemplateExtraPageDef[] | undefined) ?? [];
    const masterDefaults = (structure?.master_defaults as MasterDefaults | undefined) ?? {};

    if (masterDefaults.tagline && !website.tagline) {
      website.tagline = masterDefaults.tagline;
      await this.websiteRepo.save(website);
    }

    await this.seedPrimaryLocation(website.id, masterDefaults.location);
    const homePage = await this.seedHomePage(website.id);
    await this.seedSections(homePage.id, sections);
    await this.seedExtraPages(website.id, extraPages);
    await this.seedMasterData(website.id, masterDefaults);
  }

  /**
   * Keputusan S2 (template-sample-data-plan.md): saat template diganti dan website belum punya
   * produk sama sekali, isi data contoh template baru (tanpa menyentuh halaman/section).
   */
  async seedSampleDataIfEmpty(website: Website, templateId: string | null): Promise<boolean> {
    if (!templateId) return false;
    if ((await this.productRepo.count({ where: { website_id: website.id } })) > 0) return false;
    const structure = (await this.templateRepo.findOne({ where: { id: templateId } }))?.structure;
    const masterDefaults = (structure?.master_defaults as MasterDefaults | undefined) ?? {};
    if (!masterDefaults.products?.length && !masterDefaults.services?.length && !masterDefaults.gatherings?.length) {
      return false;
    }
    if (masterDefaults.tagline && !website.tagline) {
      website.tagline = masterDefaults.tagline;
      await this.websiteRepo.save(website);
    }
    await this.seedMasterData(website.id, masterDefaults);
    return true;
  }

  /**
   * Keputusan S3: hapus data contoh (`metadata.is_seed`). Produk yang masih dirujuk data lain
   * (pesanan, chat, blog) tidak bisa dihapus → dinonaktifkan. Kategori tidak disentuh.
   */
  async removeSampleData(websiteId: string): Promise<{ removedProducts: number; deactivatedProducts: number; removedFaqs: number }> {
    const seeds = await this.productRepo
      .createQueryBuilder('product')
      .select(['product.id', 'product.parent_product_id'])
      .where('product.website_id = :websiteId', { websiteId })
      .andWhere("product.metadata->>'is_seed' = 'true'")
      .getMany();
    // Varian dulu, baru induk (induk menghapus varian lewat CASCADE bila masih ada).
    const ordered = [...seeds.filter((row) => row.parent_product_id), ...seeds.filter((row) => !row.parent_product_id)];
    let removedProducts = 0;
    let deactivatedProducts = 0;
    for (const product of ordered) {
      try {
        const result = await this.productRepo.delete({ id: product.id, website_id: websiteId });
        removedProducts += result.affected ?? 0;
      } catch (error) {
        this.logger.warn(`Produk contoh ${product.id} masih dirujuk data lain, dinonaktifkan: ${error instanceof Error ? error.message : error}`);
        await this.productRepo.update({ id: product.id, website_id: websiteId }, { is_active: false });
        deactivatedProducts += 1;
      }
    }
    const faqs = await this.faqRepo
      .createQueryBuilder()
      .delete()
      .where('website_id = :websiteId', { websiteId })
      .andWhere("metadata->>'is_seed' = 'true'")
      .execute();
    return { removedProducts, deactivatedProducts, removedFaqs: faqs.affected ?? 0 };
  }

  private async seedMasterData(websiteId: string, masterDefaults: MasterDefaults) {
    const usedSlugs = new Set<string>();
    const categoryCache = new Map<string, string>();
    await this.seedCategories(websiteId, masterDefaults.categories, categoryCache);
    await this.seedCatalogItems(websiteId, masterDefaults.services, 'service', usedSlugs, categoryCache);
    await this.seedCatalogItems(websiteId, masterDefaults.products, 'product', usedSlugs, categoryCache);
    await this.seedCatalogItems(websiteId, masterDefaults.gatherings, 'gathering', usedSlugs, categoryCache);
    await this.seedFaqs(websiteId, masterDefaults.faqs);
  }

  /** Cari kategori yang sudah ada (per website+label) atau bikin baru — cache in-memory supaya tidak query berulang untuk label yang sama dalam 1 bootstrap. */
  private async resolveCategoryId(
    websiteId: string,
    label: string | undefined,
    cache: Map<string, string>,
  ): Promise<string | null> {
    const trimmed = label?.trim();
    if (!trimmed) return null;
    if (cache.has(trimmed)) return cache.get(trimmed)!;

    let category = await this.categoryRepo.findOne({ where: { website_id: websiteId, label: trimmed } });
    if (!category) {
      category = await this.categoryRepo.save(
        this.categoryRepo.create({ website_id: websiteId, label: trimmed }),
      );
    }
    cache.set(trimmed, category.id);
    return category.id;
  }

  /** Slug unik per website (constraint UNIQUE(website_id, slug) di website_products). */
  private async resolveUniqueSlug(
    websiteId: string,
    name: string,
    usedSlugs: Set<string>,
  ): Promise<string> {
    const base = slugify(name) || 'produk';
    let slug = base;
    let suffix = 2;
    while (
      usedSlugs.has(slug) ||
      (await this.productRepo.count({ where: { website_id: websiteId, slug } })) > 0
    ) {
      slug = `${base}-${suffix++}`;
    }
    usedSlugs.add(slug);
    return slug;
  }

  private async seedPrimaryLocation(
    websiteId: string,
    locationDefaults?: MasterDefaults['location'],
  ) {
    const location = this.locationRepo.create({
      website_id: websiteId,
      name: locationDefaults?.name ?? 'Cabang Utama',
      type: locationDefaults?.type ?? 'branch',
      is_primary: true,
      is_public: true,
      address_line: locationDefaults?.address_line ?? null,
      city: locationDefaults?.city ?? null,
      opening_hours: locationDefaults?.opening_hours ?? {},
      sort_order: 0,
      is_active: true,
    });
    await this.locationRepo.save(location);
  }

  private async seedHomePage(websiteId: string) {
    const page = this.pageRepo.create({
      website_id: websiteId,
      title: 'Home',
      slug: 'home',
      content: {},
      is_home: true,
      order: 0,
    });
    return this.pageRepo.save(page);
  }

  /** Halaman tambahan (mis. FAQ) — dibuat setelah Home, order dimulai dari 1 supaya Home tetap paling awal. */
  private async seedExtraPages(websiteId: string, pages: TemplateExtraPageDef[]) {
    for (let i = 0; i < pages.length; i++) {
      const def = pages[i];
      const page = await this.pageRepo.save(
        this.pageRepo.create({
          website_id: websiteId,
          title: def.title,
          slug: def.slug,
          content: {},
          is_home: false,
          placement: def.placement ?? 'regular',
          order: i + 1,
        }),
      );
      await this.seedSections(page.id, def.sections ?? [], false);
    }
  }

  private async seedSections(pageId: string, sections: TemplateSectionDef[], isHome = true) {
    if (sections.length === 0 && isHome) {
      await this.sectionRepo.save(
        this.sectionRepo.create({
          page_id: pageId,
          type: 'hero',
          content: { show_whatsapp_cta: true },
          order: 0,
          is_seed: true,
        }),
      );
      return;
    }

    for (let i = 0; i < sections.length; i++) {
      const def = sections[i];
      await this.sectionRepo.save(
        this.sectionRepo.create({
          page_id: pageId,
          type: def.type,
          content: def.defaults ?? {},
          order: i,
          is_seed: true,
        }),
      );
    }
  }

  /** Upsert kategori dengan gambar dari master_defaults.categories, sebelum produk di-seed supaya cache sudah terisi. */
  private async seedCategories(
    websiteId: string,
    categories: MasterDefaults['categories'] | undefined,
    cache: Map<string, string>,
  ) {
    if (!categories?.length) return;

    for (let i = 0; i < categories.length; i++) {
      const c = categories[i];
      const trimmed = c.label.trim();
      if (!trimmed || cache.has(trimmed)) continue;
      const category = await this.categoryRepo.save(
        this.categoryRepo.create({
          website_id: websiteId,
          label: trimmed,
          images: c.images ?? [],
          sort_order: i,
        }),
      );
      cache.set(trimmed, category.id);
    }
  }

  /** Seed service/produk dua tahap: item top-level (tanpa parent_key) dulu, lalu varian (parent_key) yang di-link via key hasil tahap pertama. */
  private async seedCatalogItems(
    websiteId: string,
    items: CatalogSeedItem[] | undefined,
    type: SeedProductType,
    usedSlugs: Set<string>,
    categoryCache: Map<string, string>,
  ) {
    if (!items?.length) return;

    const keyToId = new Map<string, string>();
    const topLevel = items.filter((item) => !item.parent_key);
    const children = items.filter((item) => item.parent_key);

    for (let i = 0; i < topLevel.length; i++) {
      const item = topLevel[i];
      const id = await this.createSeedProduct(websiteId, item, type, i, usedSlugs, categoryCache, null);
      if (item.key) keyToId.set(item.key, id);
    }

    for (let i = 0; i < children.length; i++) {
      const item = children[i];
      const parentId = item.parent_key ? keyToId.get(item.parent_key) ?? null : null;
      const id = await this.createSeedProduct(
        websiteId,
        item,
        type,
        topLevel.length + i,
        usedSlugs,
        categoryCache,
        parentId,
      );
      if (item.key) keyToId.set(item.key, id);
    }
  }

  private async createSeedProduct(
    websiteId: string,
    item: CatalogSeedItem,
    type: SeedProductType,
    sortOrder: number,
    usedSlugs: Set<string>,
    categoryCache: Map<string, string>,
    parentProductId: string | null,
  ): Promise<string> {
    const slug = await this.resolveUniqueSlug(websiteId, item.name, usedSlugs);
    const category_id = await this.resolveCategoryId(websiteId, item.category, categoryCache);
    const metadata = buildSeedProductMetadata(item, type);
    const saved = await this.productRepo.save(
      this.productRepo.create({
        website_id: websiteId,
        type,
        name: item.name,
        slug,
        category_id,
        parent_product_id: parentProductId,
        // HTML disanitasi seperti simpan produk dari Studio (teks polos lama → paragraf).
        description: sanitizeRichText(item.description, 'product'),
        ...(item.detail ? { detail: sanitizeRichText(item.detail, 'product') } : {}),
        price: item.price,
        images: resolveSeedImages(item),
        metadata,
        sort_order: sortOrder,
        is_active: true,
      }),
    );
    if (type === 'gathering' && item.options?.length) {
      await this.seedGatheringOptions(websiteId, saved.id, item, metadata);
    }
    return saved.id;
  }

  /**
   * Paket gathering contoh. Harga, DP, kuota & kebijakan pembatalan sama untuk semua paket dan
   * mengikuti produk (aturan `assertUniformGatheringOptionConfig`); urutan = urutan di manifest.
   */
  private async seedGatheringOptions(
    websiteId: string,
    productId: string,
    item: CatalogSeedItem,
    metadata: Record<string, unknown>,
  ) {
    const options = item.options ?? [];
    for (let index = 0; index < options.length; index++) {
      const option = options[index];
      await this.optionRepo.save(
        this.optionRepo.create({
          website_id: websiteId,
          product_id: productId,
          option_group_key: option.option_group_key,
          option_key: option.option_key,
          label: option.label,
          description: sanitizeRichText(option.description, 'basic'),
          price_per_seat: String(item.price),
          deposit_amount_per_seat: String(item.deposit_amount_per_seat ?? 0),
          currency: 'IDR',
          min_attendees: item.min_attendees ?? 0,
          max_attendees: item.max_attendees ?? 1,
          availability_window: option.availability_window ?? {},
          venue_location: option.venue_location ?? null,
          venue_address: option.venue_address ?? null,
          venue_map_url: option.venue_map_url ?? null,
          benefits: option.benefits ?? [],
          images: option.images ?? [],
          cancellation_policy: (metadata.cancellation_policy as Record<string, unknown> | undefined) ?? {},
          is_active: true,
          sort_order: index,
        }),
      );
    }
  }

  private async seedFaqs(websiteId: string, faqs?: MasterDefaults['faqs']) {
    if (!faqs?.length) return;

    for (let i = 0; i < faqs.length; i++) {
      const f = faqs[i];
      await this.faqRepo.save(
        this.faqRepo.create({
          website_id: websiteId,
          question: f.question,
          answer: f.answer,
          category: f.category ?? null,
          sort_order: i,
          is_public: true,
          is_active: true,
          metadata: { is_seed: true },
        }),
      );
    }
  }
}
