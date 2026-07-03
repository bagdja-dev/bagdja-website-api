import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Website, WebsitePage, WebsiteProduct } from '../../entities';

@Injectable()
export class PublicService {
  constructor(
    @InjectRepository(Website)
    private readonly websiteRepo: Repository<Website>,
    @InjectRepository(WebsitePage)
    private readonly pageRepo: Repository<WebsitePage>,
    @InjectRepository(WebsiteProduct)
    private readonly productRepo: Repository<WebsiteProduct>,
  ) {}

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
    const website = await this.websiteRepo.findOne({
      where: { slug: websiteSlug, is_active: true },
    });
    if (!website) throw new NotFoundException('Website not found');

    const page = await this.pageRepo.findOne({
      where: { website_id: website.id, slug: pageSlug },
      relations: ['sections'],
    });
    if (!page) throw new NotFoundException('Page not found');

    page.sections = page.sections.sort((a, b) => a.order - b.order);
    return page;
  }

  async getHomePage(websiteSlug: string) {
    const website = await this.websiteRepo.findOne({
      where: { slug: websiteSlug, is_active: true },
    });
    if (!website) throw new NotFoundException('Website not found');

    const page = await this.pageRepo.findOne({
      where: { website_id: website.id, is_home: true },
      relations: ['sections'],
    });
    if (!page) throw new NotFoundException('No home page configured');

    page.sections = page.sections.sort((a, b) => a.order - b.order);
    return page;
  }

  async getProducts(websiteSlug: string) {
    const website = await this.websiteRepo.findOne({
      where: { slug: websiteSlug, is_active: true },
    });
    if (!website) throw new NotFoundException('Website not found');

    return this.productRepo.find({
      where: { website_id: website.id, is_active: true },
      order: { name: 'ASC' },
    });
  }
}
