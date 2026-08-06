import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import {
  Website,
  WebsiteBlogPost,
  WebsiteCategory,
  WebsiteFaq,
  WebsiteLocation,
  WebsitePage,
  WebsiteProduct,
} from '../../entities';
import { parseGridQuery, paginateQueryBuilder } from '../../common/grid/grid-query.util';

const PRODUCT_SORTABLE_COLUMNS = ['name', 'price', 'sort_order', 'created_at'];

@Injectable()
export class PublicService {
  constructor(
    @InjectRepository(Website)
    private readonly websiteRepo: Repository<Website>,
    @InjectRepository(WebsitePage)
    private readonly pageRepo: Repository<WebsitePage>,
    @InjectRepository(WebsiteProduct)
    private readonly productRepo: Repository<WebsiteProduct>,
    @InjectRepository(WebsiteLocation)
    private readonly locationRepo: Repository<WebsiteLocation>,
    @InjectRepository(WebsiteFaq)
    private readonly faqRepo: Repository<WebsiteFaq>,
    @InjectRepository(WebsiteBlogPost)
    private readonly blogPostRepo: Repository<WebsiteBlogPost>,
    @InjectRepository(WebsiteCategory)
    private readonly categoryRepo: Repository<WebsiteCategory>,
  ) {}

  private async resolveWebsite(slug: string) {
    const website = await this.websiteRepo.findOne({
      where: { slug, is_active: true },
    });
    if (!website) throw new NotFoundException('Website not found');
    return website;
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

  async getWebsiteBySlug(slug: string) {
    const website = await this.websiteRepo.findOne({
      where: { slug, is_active: true },
      relations: ['template', 'pages'],
    });
    if (!website) throw new NotFoundException('Website not found');

    website.pages = website.pages.sort((a, b) => a.order - b.order);
    return website;
  }

  async getPageBySlug(websiteSlug: string, pageSlug: string) {
    const website = await this.resolveWebsite(websiteSlug);

    const page = await this.pageRepo.findOne({
      where: { website_id: website.id, slug: pageSlug },
      relations: ['sections'],
    });
    if (!page) throw new NotFoundException('Page not found');

    page.sections = page.sections.sort((a, b) => a.order - b.order);
    return page;
  }

  async getHomePage(websiteSlug: string) {
    const website = await this.resolveWebsite(websiteSlug);

    const page = await this.pageRepo.findOne({
      where: { website_id: website.id, is_home: true },
      relations: ['sections'],
    });
    if (!page) throw new NotFoundException('No home page configured');

    page.sections = page.sections.sort((a, b) => a.order - b.order);
    return page;
  }

  /**
   * List produk/layanan publik — paginated & filterable, mengikuti standar
   * grid platform Bagdja (lihat `common/grid/grid-query.util.ts`, port dari
   * `bagdja-pos-api`). Dipakai renderer template untuk fetch awal (SSR, size
   * besar) maupun "Muat Lebih Banyak"/filter kategori dari browser (client-side).
   */
  async getProducts(websiteSlug: string, query: Record<string, unknown> = {}) {
    const website = await this.resolveWebsite(websiteSlug);
    const params = parseGridQuery(query);

    const qb = this.productRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.category', 'category')
      .where('p.website_id = :websiteId', { websiteId: website.id })
      .andWhere('p.is_active = true');

    const typeFilter = params.filter.type ?? (query.type as string | undefined);
    if (typeFilter) qb.andWhere('p.type = :type', { type: typeFilter });

    const categoryIdFilter = params.filter.category_id;
    if (categoryIdFilter) qb.andWhere('p.category_id = :categoryId', { categoryId: categoryIdFilter });

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
    const dataWithInheritedText = await this.resolveInheritedText(result.data);

    // Flatten relasi category jadi label string — supaya renderer publik (bagdja-website)
    // tidak perlu tahu soal entity/relasi, cukup baca `product.category` seperti sebelumnya.
    return {
      ...result,
      data: dataWithInheritedText.map((p) => ({ ...p, category: p.category?.label ?? null })),
    };
  }

  /**
   * Varian yang di-set `metadata.inherit_description = true` mengambil
   * `description`/`detail` dari produk induknya secara live (bukan copy
   * sekali saat dibuat) — supaya edit deskripsi induk otomatis kepakai di
   * semua varian yang inherit, tanpa perlu update satu-satu.
   */
  private async resolveInheritedText(products: WebsiteProduct[]): Promise<WebsiteProduct[]> {
    const parentIdsNeeded = new Set<string>();
    for (const p of products) {
      if (p.metadata?.inherit_description === true && p.parent_product_id) {
        parentIdsNeeded.add(p.parent_product_id);
      }
    }
    if (parentIdsNeeded.size === 0) return products;

    const parents = await this.productRepo.find({ where: { id: In([...parentIdsNeeded]) } });
    const parentById = new Map(parents.map((parent) => [parent.id, parent]));

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

  async getCategories(websiteSlug: string) {
    const website = await this.resolveWebsite(websiteSlug);

    return this.categoryRepo.find({
      where: { website_id: website.id, is_active: true },
      order: { sort_order: 'ASC', label: 'ASC' },
    });
  }

  async getLocations(websiteSlug: string, type?: string) {
    const website = await this.resolveWebsite(websiteSlug);

    return this.locationRepo.find({
      where: {
        website_id: website.id,
        is_active: true,
        is_public: true,
        ...(type ? { type } : {}),
      },
      order: { sort_order: 'ASC', name: 'ASC' },
    });
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
    return post;
  }
}
