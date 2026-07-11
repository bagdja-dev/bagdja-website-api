import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  Website,
  WebsiteBlogPost,
  WebsiteFaq,
  WebsiteLocation,
  WebsitePage,
  WebsiteProduct,
} from '../../entities';

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
  ) {}

  private async resolveWebsite(slug: string) {
    const website = await this.websiteRepo.findOne({
      where: { slug, is_active: true },
    });
    if (!website) throw new NotFoundException('Website not found');
    return website;
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

  async getProducts(websiteSlug: string, type?: string) {
    const website = await this.resolveWebsite(websiteSlug);

    return this.productRepo.find({
      where: {
        website_id: website.id,
        is_active: true,
        ...(type ? { type } : {}),
      },
      order: { sort_order: 'ASC', name: 'ASC' },
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
