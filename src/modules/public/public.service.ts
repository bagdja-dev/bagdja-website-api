import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { isUUID } from 'class-validator';
import { In, Repository } from 'typeorm';

import { ChatServiceClient } from '../../common/chat-service/chat-service.client';
import { parseGridQuery, paginateQueryBuilder } from '../../common/grid/grid-query.util';
import { sanitizeRichText } from '../../common/rich-text';
import {
  TenantStaff,
  Website,
  WebsiteBlogPost,
  WebsiteBlogPostProduct,
  WebsiteCategory,
  WebsiteFaq,
  WebsiteLocation,
  WebsiteLanguage,
  WebsitePage,
  WebsitePageTranslation,
  WebsiteProduct,
  WebsiteProductTranslation,
  WebsiteProductLocation,
  FulfillmentFlow,
  WebsiteEventProductOption,
  WebsiteTemplateVersion,
} from '../../entities';
import { ShippingClientService } from '../shipping/shipping-client.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

import { resolveTemplateRuntime } from './template-runtime-resolution';

const PRODUCT_SORTABLE_COLUMNS = ['name', 'price', 'sort_order', 'created_at'];

@Injectable()
export class PublicService {
  constructor(
    @InjectRepository(Website)
    private readonly websiteRepo: Repository<Website>,
    @InjectRepository(WebsitePage)
    private readonly pageRepo: Repository<WebsitePage>,
    @InjectRepository(WebsitePageTranslation)
    private readonly pageTranslationRepo: Repository<WebsitePageTranslation>,
    @InjectRepository(WebsiteLanguage)
    private readonly languageRepo: Repository<WebsiteLanguage>,
    @InjectRepository(WebsiteProduct)
    private readonly productRepo: Repository<WebsiteProduct>,
    @InjectRepository(WebsiteProductTranslation)
    private readonly productTranslationRepo: Repository<WebsiteProductTranslation>,
    @InjectRepository(WebsiteLocation)
    private readonly locationRepo: Repository<WebsiteLocation>,
    @InjectRepository(WebsiteFaq)
    private readonly faqRepo: Repository<WebsiteFaq>,
    @InjectRepository(WebsiteBlogPost)
    private readonly blogPostRepo: Repository<WebsiteBlogPost>,
    @InjectRepository(WebsiteBlogPostProduct)
    private readonly blogPostProductRepo: Repository<WebsiteBlogPostProduct>,
    @InjectRepository(WebsiteCategory)
    private readonly categoryRepo: Repository<WebsiteCategory>,
    @InjectRepository(TenantStaff)
    private readonly staffRepo: Repository<TenantStaff>,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly shippingClientService: ShippingClientService,
    @InjectRepository(FulfillmentFlow)
    private readonly fulfillmentFlowRepo: Repository<FulfillmentFlow>,
    @InjectRepository(WebsiteProductLocation)
    private readonly productLocationRepo: Repository<WebsiteProductLocation>,
    @InjectRepository(WebsiteEventProductOption)
    private readonly gatheringOptionRepo: Repository<WebsiteEventProductOption>,
    private readonly chatServiceClient: ChatServiceClient,
    @InjectRepository(WebsiteTemplateVersion)
    private readonly templateVersionRepo: Repository<WebsiteTemplateVersion>,
  ) {}

  async getRealtimeWsToken(): Promise<{ access_token: string; expires_in: number; channels: string[] }> {
    return this.chatServiceClient.getRealtimeWsToken();
  }

  /** Proxy tipis ke bagdja-shipping-service — dipakai autocomplete alamat checkout, tidak butuh login. */
  async searchShippingAreas(query: string) {
    return this.shippingClientService.searchArea(query);
  }

  private async resolveWebsite(slug: string) {
    const website = await this.websiteRepo.findOne({
      where: { slug, is_active: true },
    });
    if (!website) throw new NotFoundException('Website not found');
    return website;
  }

  /**
   * Fase 5 paywall: cek apakah website ini milik user yang subscription-nya
   * tidak aktif (CANCELLED / SUSPENDED / EXPIRED / tanpa subscription).
   *
   * Defensif: kalau owner tidak ditemukan ATAU payment-service error
   * (SubscriptionsService.findMy throws BadGatewayException), anggap AKTIF
   * (jangan take down website publik gara-gara core service down).
   * Kalau owner tidak punya subscription apa pun → tetap AKTIF (free plan
   * berlaku default — lihat PlanLimitService.FREE_PLAN_LIMITS).
   */
  private async isSubscriptionInactive(websiteId: string): Promise<boolean> {
    try {
      const owner = await this.staffRepo.findOne({
        where: { website_id: websiteId, role: 'owner', is_active: true },
      });
      if (!owner) return false;

      const subs = (await this.subscriptionsService.findMy(owner.user_id)) as Array<{
        status?: string;
      }>;
      if (!Array.isArray(subs)) return false;

      const activeStatuses = new Set(['ACTIVE', 'TRIALING', 'PAST_DUE', 'active', 'trialing', 'past_due']);
      return subs.length > 0 && !subs.some((s) => activeStatuses.has(s.status || ''));
    } catch {
      // Payment-service unreachable / error → jangan take down website
      return false;
    }
  }

  /** Sertakan flag paywall di respons website publik. */
  private async withPaywallFlag<T extends object>(websiteId: string, data: T): Promise<T & { subscription_inactive: boolean }> {
    const inactive = await this.isSubscriptionInactive(websiteId);
    return { ...(data as Record<string, unknown>), subscription_inactive: inactive } as T & {
      subscription_inactive: boolean;
    };
  }

  /** Dipakai oleh middleware web renderer untuk resolusi custom domain -> slug tenant. */
  async resolveDomain(host: string) {
    const website = await this.websiteRepo.findOne({
      where: { domain: host, is_active: true },
    });
    if (!website || !website.domain_verified_at) {
      throw new NotFoundException('Domain not found or not verified');
    }
    return { slug: website.slug };
  }

  async getSearchConsoleVerification(slug: string, filename: string) {
    if (!/^google[a-zA-Z0-9_-]+\.html$/.test(filename)) {
      throw new NotFoundException('Verification file not found');
    }

    const website = await this.websiteRepo.findOne({
      where: { slug, is_active: true },
      select: ['id', 'search_console_verification_filename', 'search_console_verification_content'],
    });
    const expectedContent = `google-site-verification: ${filename}`;
    if (
      website?.search_console_verification_filename !== filename ||
      website.search_console_verification_content !== expectedContent
    ) {
      throw new NotFoundException('Verification file not found');
    }
    return { filename, content: expectedContent };
  }

  async getWebsiteBySlug(slug: string) {
    const website = await this.websiteRepo.findOne({
      where: { slug, is_active: true },
      relations: ['template', 'pages'],
    });
    if (!website) throw new NotFoundException('Website not found');

    website.pages = website.pages.sort((a, b) => a.order - b.order);
    const pinnedVersion =
      website.template?.source === 'package' && website.template_version_id
        ? await this.templateVersionRepo.findOne({ where: { id: website.template_version_id } })
        : null;
    const templateRuntime = resolveTemplateRuntime(website, pinnedVersion);
    // ID pengajuan uji tidak dibuka ke publik; renderer hanya perlu tahu ada uji (template-candidate-trial-plan §4).
    const {
      trial_submission_id: trialSubmissionId,
      search_console_verification_filename: _verificationFilename,
      search_console_verification_content: _verificationContent,
      ...publicWebsite
    } = website;
    void _verificationFilename;
    void _verificationContent;
    return this.withPaywallFlag(website.id, {
      ...publicWebsite,
      template_trial_active: Boolean(trialSubmissionId),
      // Renderer hanya memakai runtime eksternal lewat field ini (lihat template-runtime-resolution.ts).
      template_runtime: templateRuntime,
      template_runtime_version: templateRuntime?.version ?? null,
    });
  }

  async getLoginBrandingBySlug(slug: string) {
    const website = await this.websiteRepo.findOne({
      where: { slug, is_active: true },
      select: ['name', 'logo_url', 'login_background_url'],
    });
    if (!website) throw new NotFoundException('Website not found');

    return {
      name: website.name,
      logoUrl: website.logo_url,
      backgroundUrl: website.login_background_url,
    };
  }

  async getPageBySlug(websiteSlug: string, pageSlug: string, locale?: string, acceptLanguage?: string) {
    const website = await this.resolveWebsite(websiteSlug);

    let page = await this.pageRepo.findOne({
      where: { website_id: website.id, slug: pageSlug },
      relations: ['sections'],
    });
    let matchedTranslation: WebsitePageTranslation | undefined;
    if (!page) {
      const matchingTranslations = await this.pageTranslationRepo.find({
        where: { website_id: website.id, slug: pageSlug, is_published: true },
      });
      const localeOrder = await this.pageLocaleOrder(website.id, locale, acceptLanguage);
      matchedTranslation = localeOrder
        .map((candidate) => matchingTranslations.find((translation) => translation.locale === candidate))
        .find((translation) => translation !== undefined)
        ?? matchingTranslations[0];
      if (matchedTranslation) {
        page = await this.pageRepo.findOne({
          where: { website_id: website.id, id: matchedTranslation.page_id },
          relations: ['sections'],
        });
      }
    }
    if (!page) throw new NotFoundException('Page not found');

    page.sections = page.sections.sort((a, b) => a.order - b.order);
    return this.applyPageTranslation(
      page,
      website.id,
      locale ?? matchedTranslation?.locale,
      acceptLanguage,
    );
  }

  async getHomePage(websiteSlug: string, locale?: string, acceptLanguage?: string) {
    const website = await this.resolveWebsite(websiteSlug);

    const page = await this.pageRepo.findOne({
      where: { website_id: website.id, is_home: true },
      relations: ['sections'],
    });
    if (!page) throw new NotFoundException('No home page configured');

    page.sections = page.sections.sort((a, b) => a.order - b.order);
    return this.applyPageTranslation(page, website.id, locale, acceptLanguage);
  }

  private async applyPageTranslation(
    page: WebsitePage,
    websiteId: string,
    locale?: string,
    acceptLanguage?: string,
  ): Promise<WebsitePage> {
    const preferred = await this.pageLocaleOrder(websiteId, locale, acceptLanguage);
    if (!preferred.length) return page;
    const translations = await this.pageTranslationRepo.find({
      where: { website_id: websiteId, page_id: page.id, is_published: true },
    });
    const translation = preferred
      .map((candidate) => translations.find((item) => item.locale === candidate))
      .find((item) => item !== undefined);
    if (!translation) return page;

    return {
      ...page,
      title: translation.title || page.title,
      slug: translation.slug || page.slug,
      seo_title: translation.seo_title || page.seo_title,
      seo_description: translation.seo_description || page.seo_description,
    };
  }

  private async pageLocaleOrder(websiteId: string, locale?: string, acceptLanguage?: string): Promise<string[]> {
    const languages = await this.languageRepo.find({
      where: { website_id: websiteId, is_active: true },
      order: { sort_order: 'ASC', locale: 'ASC' },
    });
    const activeLocales = languages.map((language) => language.locale);
    const preferred: string[] = [];
    const addMatch = (candidate: string) => {
      const normalized = candidate.toLowerCase();
      const base = normalized.split('-')[0];
      const match = activeLocales.find((item) => item.toLowerCase() === normalized)
        ?? activeLocales.find((item) => item.toLowerCase() === base)
        ?? activeLocales.find((item) => item.toLowerCase().startsWith(`${base}-`));
      if (match && !preferred.includes(match)) preferred.push(match);
    };

    if (locale) {
      addMatch(locale);
    } else {
      const accepted = (acceptLanguage ?? '')
        .split(',')
        .map((item, index) => {
          const [tag, ...params] = item.trim().split(';');
          const qualityParam = params.find((param) => param.trim().startsWith('q='));
          const quality = qualityParam ? Number(qualityParam.trim().slice(2)) : 1;
          return { tag: tag.trim(), quality: Number.isFinite(quality) ? quality : 0, index };
        })
        .filter((item) => item.tag && item.tag !== '*' && item.quality > 0)
        .sort((a, b) => b.quality - a.quality || a.index - b.index);
      accepted.forEach(({ tag }) => addMatch(tag));
    }

    const fallback = languages.find((language) => language.is_default)?.locale
      ?? activeLocales.find((item) => item === 'id')
      ?? activeLocales[0];
    if (fallback && !preferred.includes(fallback)) preferred.push(fallback);
    activeLocales.forEach((item) => {
      if (!preferred.includes(item)) preferred.push(item);
    });
    return preferred;
  }

  /**
   * List produk/layanan publik — paginated & filterable, mengikuti standar
   * grid platform Bagdja (lihat `common/grid/grid-query.util.ts`, port dari
   * `bagdja-pos-api`). Dipakai renderer template untuk fetch awal (SSR, size
   * besar) maupun "Muat Lebih Banyak"/filter kategori dari browser (client-side).
   */
  async getProducts(
    websiteSlug: string,
    query: Record<string, unknown> = {},
    locale?: string,
    acceptLanguage?: string,
  ) {
    const website = await this.resolveWebsite(websiteSlug);
    const params = parseGridQuery(query);

    // CATATAN: sengaja TIDAK leftJoinAndSelect('p.product_locations', ...) di
    // query ber-paginasi ini — join ke relasi one-to-many bikin baris hasil
    // SQL terduplikasi SEBELUM skip/take diterapkan (bug klasik TypeORM
    // pagination+join), jadi produk multi-lokasi bisa membuat halaman terpotong
    // atau produk hilang/dobel. Lokasi diambil terpisah di bawah, cuma untuk
    // produk yang benar-benar masuk halaman hasil.
    const qb = this.productRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.category', 'category')
      .leftJoinAndSelect('p.uom', 'uom')
      .where('p.website_id = :websiteId', { websiteId: website.id })
      .andWhere('p.is_active = true');

    const typeFilter = params.filter.type ?? (query.type as string | undefined);
    // 'all' = semua tipe (section Daftar Produk dengan pilihan "Semua tipe").
    if (typeFilter && typeFilter !== 'all') qb.andWhere('p.type = :type', { type: typeFilter });

    // Satu id atau beberapa id dipisah koma (section Daftar Produk dengan beberapa kategori).
    const categoryIds = String(params.filter.category_id ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter((id) => /^[0-9a-f-]{36}$/i.test(id))
      .slice(0, 50);
    if (categoryIds.length === 1) qb.andWhere('p.category_id = :categoryId', { categoryId: categoryIds[0] });
    else if (categoryIds.length > 1) qb.andWhere('p.category_id IN (:...categoryIds)', { categoryIds });

    // Dipakai grid/listing (products_grid, category_listing) supaya row varian
    // (mis. warna/ukuran) tidak nongol jadi kartu sendiri — 1 keluarga varian
    // cuma tampil 1 kartu (produk induk). Halaman detail produk TIDAK pakai
    // filter ini, karena varian tetap harus bisa diakses lewat slug-nya sendiri.
    if (params.filter.top_level === 'true') {
      qb.andWhere('p.parent_product_id IS NULL');
    }

    if (params.search) {
      qb.andWhere('p.name ILIKE :search', { search: `%${params.search}%` });
    }

    // Default order stabil (sort_order lalu nama) — kalau caller kirim `sort=`
    // eksplisit, `paginateQueryBuilder` akan menimpa ini dengan satu kolom saja.
    qb.orderBy('p.sort_order', 'ASC').addOrderBy('p.name', 'ASC');

    const result = await paginateQueryBuilder(qb, params, 'p', PRODUCT_SORTABLE_COLUMNS);
    const localeOrder = await this.pageLocaleOrder(
      website.id,
      locale ?? (typeof query.locale === 'string' ? query.locale : undefined),
      acceptLanguage,
    );
    const localizedProducts = await this.applyProductTranslations(result.data, website.id, localeOrder);
    const categoryIdsForPage = [...new Set(localizedProducts.map((product) => product.category?.id).filter((id): id is string => Boolean(id)))];
    const categories = categoryIdsForPage.length
      ? await this.categoryRepo.find({
        where: { website_id: website.id, id: In(categoryIdsForPage) },
        relations: { translations: true },
      })
      : [];
    const localizedCategories = this.applyCategoryTranslations(categories, localeOrder);
    const categoryById = new Map(localizedCategories.map((category) => [category.id, category]));
    const dataWithInheritedText = await this.resolveInheritedText(localizedProducts, website.id, localeOrder);

    const productIds = dataWithInheritedText.map((p) => p.id);
    const locationRows = productIds.length
      ? await this.productLocationRepo.find({ where: { product_id: In(productIds) } })
      : [];
    const gatheringOptionRows = productIds.length
      ? await this.gatheringOptionRepo.find({
          where: { website_id: website.id, product_id: In(productIds), is_active: true },
          // Urutan kelompok & opsi = urutan seller di Studio (sort_order global); kelompok/label hanya pemecah seri.
          order: { sort_order: 'ASC', option_group_key: 'ASC', label: 'ASC' },
        })
      : [];
    const locationIdsByProduct = new Map<string, string[]>();
    for (const row of locationRows) {
      const list = locationIdsByProduct.get(row.product_id) ?? [];
      list.push(row.location_id);
      locationIdsByProduct.set(row.product_id, list);
    }
    const gatheringOptionsByProduct = new Map<string, WebsiteEventProductOption[]>();
    for (const option of gatheringOptionRows) {
      const list = gatheringOptionsByProduct.get(option.product_id) ?? [];
      list.push(option);
      gatheringOptionsByProduct.set(option.product_id, list);
    }

    // Flatten relasi category jadi label string — supaya renderer publik (bagdja-website)
    // tidak perlu tahu soal entity/relasi, cukup baca `product.category` seperti sebelumnya.
    return {
      ...result,
      data: dataWithInheritedText.map((p) => {
        const location_ids = locationIdsByProduct.get(p.id) ?? [];
        return {
          ...p,
          description: sanitizeRichText(p.description, 'product'),
          location_ids,
          category: (p.category ? categoryById.get(p.category.id)?.label ?? p.category.label : null),
          ...(p.type === 'gathering'
            ? { gathering_options: gatheringOptionsByProduct.get(p.id) ?? [] }
            : {}),
        };
      }),
    };
  }

  /**
   * Varian yang di-set `metadata.inherit_description = true` mengambil
   * `description`/`detail` dari produk induknya secara live (bukan copy
   * sekali saat dibuat) — supaya edit deskripsi induk otomatis kepakai di
   * semua varian yang inherit, tanpa perlu update satu-satu.
   */
  private async applyProductTranslations(
    products: WebsiteProduct[],
    websiteId: string,
    localeOrder: string[],
  ): Promise<WebsiteProduct[]> {
    if (!products.length || !localeOrder.length) return products;
    const defaultLanguage = await this.languageRepo.findOne({
      where: { website_id: websiteId, is_default: true },
    });
    const defaultLocaleIndex = defaultLanguage ? localeOrder.indexOf(defaultLanguage.locale) : -1;
    const translationLocaleOrder = defaultLocaleIndex >= 0 ? localeOrder.slice(0, defaultLocaleIndex) : localeOrder;
    if (!translationLocaleOrder.length) return products;
    const translations = await this.productTranslationRepo.find({
      where: { website_id: websiteId, product_id: In(products.map((product) => product.id)), is_published: true },
    });
    return products.map((product) => {
      const translation = translationLocaleOrder
        .map((candidate) => translations.find((item) => item.product_id === product.id && item.locale === candidate))
        .find((item) => item !== undefined);
      if (!translation) return product;
      return {
        ...product,
        name: translation.name || product.name,
        slug: translation.slug || product.slug,
        description: translation.description || product.description,
        detail: translation.detail || product.detail,
        seo_title: translation.seo_title || product.seo_title,
        seo_description: translation.seo_description || product.seo_description,
        seo_image: translation.seo_image || product.seo_image,
        seo_no_index: translation.seo_no_index,
      };
    });
  }

  private async resolveInheritedText(
    products: WebsiteProduct[],
    websiteId: string,
    localeOrder: string[],
  ): Promise<WebsiteProduct[]> {
    const parentIdsNeeded = new Set<string>();
    for (const p of products) {
      if (p.metadata?.inherit_description === true && p.parent_product_id) {
        parentIdsNeeded.add(p.parent_product_id);
      }
    }
    if (parentIdsNeeded.size === 0) return products;

    const parents = await this.productRepo.find({ where: { id: In([...parentIdsNeeded]) } });
    const localizedParents = await this.applyProductTranslations(parents, websiteId, localeOrder);
    const parentById = new Map(localizedParents.map((parent) => [parent.id, parent]));

    return products.map((p) => {
      if (p.metadata?.inherit_description === true && p.parent_product_id) {
        const parent = parentById.get(p.parent_product_id);
        if (parent) {
          return { ...p, description: parent.description, detail: parent.detail };
        }
      }
      return p;
    });
  }

  async getCategories(websiteSlug: string, locale?: string, acceptLanguage?: string) {
    const website = await this.resolveWebsite(websiteSlug);

    const categories = await this.categoryRepo.find({
      where: { website_id: website.id, is_active: true },
      order: { sort_order: 'ASC', label: 'ASC' },
      relations: { translations: true },
    });
    const localeOrder = await this.pageLocaleOrder(website.id, locale, acceptLanguage);
    const localized = this.applyCategoryTranslations(categories, localeOrder);
    return localized.map((category) => {
      const publicCategory = { ...category };
      Reflect.deleteProperty(publicCategory, 'translations');
      return publicCategory;
    });
  }

  private applyCategoryTranslations(
    categories: WebsiteCategory[],
    localeOrder: string[],
  ): WebsiteCategory[] {
    if (!categories.length || !localeOrder.length) return categories;

    return categories.map((category) => {
      const translation = localeOrder
        .map((candidate) => category.translations?.find((item) => item.locale === candidate))
        .find((item) => item !== undefined);
      if (!translation) return category;
      return {
        ...category,
        label: translation.label || category.label,
        description: translation.description || category.description,
      };
    });
  }

  async getLocations(websiteSlug: string, type?: string) {
    const website = await this.resolveWebsite(websiteSlug);

    const locations = await this.locationRepo.find({
      where: {
        website_id: website.id,
        is_active: true,
        is_public: true,
        ...(type ? { type } : {}),
      },
      order: { sort_order: 'ASC', name: 'ASC' },
    });

    // `shipping_area_name`/`active_couriers` sengaja TIDAK diekspos mentah ke
    // publik (data internal shipping-service) — cukup boolean derived-nya,
    // dipakai renderer untuk tahu lokasi mana yang bisa dipilih jadi asal
    // pengiriman saat checkout (lihat ShippingCalculationService).
    return locations.map(({ shipping_area_name, active_couriers, ...rest }) => ({
      ...rest,
      shipping_enabled: Boolean(shipping_area_name),
    }));
  }

  async getFaqs(websiteSlug: string, category?: string) {
    const website = await this.resolveWebsite(websiteSlug);

    return this.faqRepo.find({
      where: {
        website_id: website.id,
        is_active: true,
        is_public: true,
        ...(category ? { category } : {}),
      },
      order: { sort_order: 'ASC', created_at: 'ASC' },
    });
  }

  async getFulfillmentFlow(websiteSlug: string, flowId: string) {
    const website = await this.resolveWebsite(websiteSlug);
    if (!isUUID(flowId, 'all')) throw new NotFoundException('Fulfillment flow not found');
    const flow = await this.fulfillmentFlowRepo.findOne({
      where: { id: flowId, website_id: website.id, is_active: true },
      relations: { steps: true },
    });
    if (!flow) throw new NotFoundException('Fulfillment flow not found');
    flow.steps = [...flow.steps].sort((a, b) => a.sequence - b.sequence);
    return {
      id: flow.id,
      name: flow.name,
      description: flow.description,
      steps: flow.steps.map((step) => ({
        sequence: step.sequence,
        status_name: step.status_name,
        description: step.description,
        process_day: step.process_day,
      })),
    };
  }

  async getBlogPosts(websiteSlug: string, search?: string, ids?: string[]) {
    const website = await this.resolveWebsite(websiteSlug);

    const qb = this.blogPostRepo
      .createQueryBuilder('post')
      .where('post.website_id = :websiteId', { websiteId: website.id })
      .andWhere('post.is_published = true');

    if (ids?.length) {
      qb.andWhere('post.id IN (:...ids)', { ids });
    }
    if (search?.trim()) {
      qb.andWhere('(post.title ILIKE :search OR post.excerpt ILIKE :search)', {
        search: `%${search.trim()}%`,
      });
    }

    qb.orderBy('post.published_at', 'DESC').addOrderBy('post.created_at', 'DESC');

    return qb.getMany();
  }

  async getBlogPostBySlug(websiteSlug: string, postSlug: string) {
    const website = await this.resolveWebsite(websiteSlug);

    const post = await this.blogPostRepo.findOne({
      where: { website_id: website.id, slug: postSlug, is_published: true },
    });
    if (!post) throw new NotFoundException('Blog post not found');
    const relatedProducts = await this.blogPostProductRepo.find({
      where: { blog_post_id: post.id },
      relations: { product: true },
      order: { sort_order: 'ASC' },
    });

    return Object.assign(post, {
      related_products: relatedProducts.flatMap(({ product }) => product?.is_active ? [{
        id: product.id,
        name: product.name,
        slug: product.slug,
        price: product.price,
        images: product.images,
      }] : []),
    });
  }
}
