import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  Website,
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

interface CatalogSeedItem {
  name: string;
  price: number;
  description?: string;
  duration_minutes?: number;
  images?: string[];
  image?: string;
  sku?: string;
}

interface MasterDefaults {
  tagline?: string;
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
    const masterDefaults = (structure?.master_defaults as MasterDefaults | undefined) ?? {};

    if (masterDefaults.tagline && !website.tagline) {
      website.tagline = masterDefaults.tagline;
      await this.websiteRepo.save(website);
    }

    await this.seedPrimaryLocation(website.id, masterDefaults.location);
    const homePage = await this.seedHomePage(website.id);
    await this.seedSections(homePage.id, sections);
    const usedSlugs = new Set<string>();
    await this.seedServices(website.id, masterDefaults.services, usedSlugs);
    await this.seedProducts(website.id, masterDefaults.products, usedSlugs);
    await this.seedFaqs(website.id, masterDefaults.faqs);
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

  private async seedSections(pageId: string, sections: TemplateSectionDef[]) {
    if (sections.length === 0) {
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

  private async seedServices(
    websiteId: string,
    services: MasterDefaults['services'] | undefined,
    usedSlugs: Set<string>,
  ) {
    if (!services?.length) return;

    for (let i = 0; i < services.length; i++) {
      const s = services[i];
      const slug = await this.resolveUniqueSlug(websiteId, s.name, usedSlugs);
      await this.productRepo.save(
        this.productRepo.create({
          website_id: websiteId,
          type: 'service',
          name: s.name,
          slug,
          description: s.description ?? null,
          price: s.price,
          images: resolveSeedImages(s),
          metadata: {
            ...(s.duration_minutes != null ? { duration_minutes: s.duration_minutes } : {}),
            is_bookable: true,
          },
          sort_order: i,
          is_active: true,
        }),
      );
    }
  }

  private async seedProducts(
    websiteId: string,
    products: MasterDefaults['products'] | undefined,
    usedSlugs: Set<string>,
  ) {
    if (!products?.length) return;

    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      const slug = await this.resolveUniqueSlug(websiteId, p.name, usedSlugs);
      await this.productRepo.save(
        this.productRepo.create({
          website_id: websiteId,
          type: 'product',
          name: p.name,
          slug,
          description: p.description ?? null,
          price: p.price,
          images: resolveSeedImages(p),
          metadata: {
            ...(p.sku ? { sku: p.sku } : {}),
          },
          sort_order: i,
          is_active: true,
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
          metadata: {},
        }),
      );
    }
  }
}
