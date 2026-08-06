import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
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
import { extractTemplateTheme } from '../../common/website-theme';

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
  images?: string[];
  image?: string;
  sku?: string;
  variant_attributes?: Record<string, string>;
  inherit_description?: boolean;
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

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

@Injectable()
export class WebsiteBootstrapService {
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
  ) {}

  async bootstrap(website: Website, templateId: string | null): Promise<void> {
    const structure = templateId
      ? (await this.templateRepo.findOne({ where: { id: templateId } }))?.structure
      : null;

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
    const usedSlugs = new Set<string>();
    const categoryCache = new Map<string, string>();
    await this.seedCategories(website.id, masterDefaults.categories, categoryCache);
    await this.seedCatalogItems(website.id, masterDefaults.services, 'service', usedSlugs, categoryCache);
    await this.seedCatalogItems(website.id, masterDefaults.products, 'product', usedSlugs, categoryCache);
    await this.seedFaqs(website.id, masterDefaults.faqs);
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
    type: 'service' | 'product',
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
    type: 'service' | 'product',
    sortOrder: number,
    usedSlugs: Set<string>,
    categoryCache: Map<string, string>,
    parentProductId: string | null,
  ): Promise<string> {
    const slug = await this.resolveUniqueSlug(websiteId, item.name, usedSlugs);
    const category_id = await this.resolveCategoryId(websiteId, item.category, categoryCache);
    const saved = await this.productRepo.save(
      this.productRepo.create({
        website_id: websiteId,
        type,
        name: item.name,
        slug,
        category_id,
        parent_product_id: parentProductId,
        description: item.description ?? null,
        price: item.price,
        images: resolveSeedImages(item),
        metadata: {
          ...(item.sku ? { sku: item.sku } : {}),
          ...(type === 'service'
            ? { is_bookable: true, ...(item.duration_minutes != null ? { duration_minutes: item.duration_minutes } : {}) }
            : {}),
          ...(item.variant_attributes ? { variant_attributes: item.variant_attributes } : {}),
          ...(item.inherit_description ? { inherit_description: true } : {}),
        },
        sort_order: sortOrder,
        is_active: true,
      }),
    );
    return saved.id;
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
          metadata: {},
        }),
      );
    }
  }
}
