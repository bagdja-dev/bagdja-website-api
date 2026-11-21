import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { TenantStaff, WebsiteLanguage, WebsitePage, WebsitePageTranslation } from '../../entities';
import { PlanLimitService } from '../subscriptions/plan-limit.service';

import { CreatePageDto } from './dto/create-page.dto';
import { ReorderPagesDto } from './dto/reorder-pages.dto';
import { UpdatePageDto } from './dto/update-page.dto';
import { UpsertPageTranslationDto } from './dto/upsert-page-translation.dto';

@Injectable()
export class PagesService {
  constructor(
    @InjectRepository(WebsitePage)
    private readonly pageRepo: Repository<WebsitePage>,
    @InjectRepository(WebsitePageTranslation)
    private readonly pageTranslationRepo: Repository<WebsitePageTranslation>,
    @InjectRepository(WebsiteLanguage)
    private readonly languageRepo: Repository<WebsiteLanguage>,
    @InjectRepository(TenantStaff)
    private readonly staffRepo: Repository<TenantStaff>,
    private readonly planLimitService: PlanLimitService,
  ) {}

  async findAll(websiteId: string) {
    return this.pageRepo.find({
      where: { website_id: websiteId },
      order: { order: 'ASC', created_at: 'ASC' },
    });
  }

  async findOne(pageId: string) {
    const page = await this.pageRepo.findOne({
      where: { id: pageId },
      relations: ['sections'],
    });
    if (!page) throw new NotFoundException('Page not found');

    page.sections = page.sections.sort((a, b) => a.order - b.order);
    const translations = await this.pageTranslationRepo.find({
      where: { page_id: page.id, website_id: page.website_id },
      order: { locale: 'ASC' },
    });
    return Object.assign(page, {
      translations: translations.map(({
        locale,
        title,
        slug,
        seo_title,
        seo_description,
        seo_image,
        seo_no_index,
      }) => ({
        locale,
        title,
        slug,
        seo_title,
        seo_description,
        seo_image,
        seo_no_index,
      })),
    });
  }

  async upsertTranslation(
    pageId: string,
    websiteId: string,
    locale: string,
    dto: UpsertPageTranslationDto,
  ) {
    const page = await this.pageRepo.findOne({ where: { id: pageId, website_id: websiteId } });
    if (!page) throw new NotFoundException('Page not found');

    const language = await this.languageRepo.findOne({
      where: { website_id: websiteId, locale, is_active: true },
    });
    if (!language) throw new NotFoundException('Active website language not found');

    let translation = await this.pageTranslationRepo.findOne({
      where: { website_id: websiteId, page_id: pageId, locale },
    });
    if (translation) {
      translation.slug = dto.slug.trim() || page.slug;
      translation.title = dto.title.trim() || page.title;
      if (dto.seo_title !== undefined) translation.seo_title = dto.seo_title?.trim() || null;
      if (dto.seo_description !== undefined) translation.seo_description = dto.seo_description?.trim() || null;
      if (dto.seo_image !== undefined) translation.seo_image = dto.seo_image?.trim() || null;
      if (dto.seo_no_index !== undefined) translation.seo_no_index = dto.seo_no_index;
    } else {
      translation = this.pageTranslationRepo.create({
        website_id: websiteId,
        page_id: pageId,
        locale,
        slug: dto.slug.trim() || page.slug,
        title: dto.title.trim() || page.title,
        content: page.content ?? {},
        seo_title: dto.seo_title === undefined ? page.seo_title : dto.seo_title?.trim() || null,
        seo_description: dto.seo_description === undefined ? page.seo_description : dto.seo_description?.trim() || null,
        seo_image: dto.seo_image === undefined ? page.seo_image : dto.seo_image?.trim() || null,
        seo_no_index: dto.seo_no_index ?? page.seo_no_index,
        external_url: page.external_url,
      });
    }

    const saved = await this.pageTranslationRepo.save(translation);
    return {
      locale: saved.locale,
      title: saved.title,
      slug: saved.slug,
      seo_title: saved.seo_title,
      seo_description: saved.seo_description,
      seo_image: saved.seo_image,
      seo_no_index: saved.seo_no_index,
    };
  }

  async create(websiteId: string, dto: CreatePageDto) {
    // Plan limit enforcement (Fase 3): cek jumlah pages website sebelum
    // menambah baru — limit berdasarkan plan pemilik website.
    await this.assertWithinPageLimit(websiteId);

    const existing = await this.pageRepo.findOne({
      where: { website_id: websiteId, slug: dto.slug },
    });
    if (existing) throw new ConflictException(`Page slug "${dto.slug}" already exists in this website`);

    if (dto.is_home) {
      await this.pageRepo.update({ website_id: websiteId, is_home: true }, { is_home: false });
    }

    const page = this.pageRepo.create({
      website_id: websiteId,
      name: dto.name?.trim() || dto.title.trim(),
      title: dto.title,
      slug: dto.slug,
      seo_title: dto.seo_title ?? null,
      seo_description: dto.seo_description ?? null,
      seo_image: dto.seo_image ?? null,
      seo_no_index: dto.seo_no_index ?? false,
      link_mode: dto.link_mode ?? 'internal',
      external_url: dto.link_mode === 'external' ? dto.external_url?.trim() || null : null,
      content: dto.content ?? {},
      is_home: dto.is_home ?? false,
      placement: dto.placement ?? 'regular',
      order: dto.order ?? 0,
    });

    return this.pageRepo.save(page);
  }

  /** Resolve owner user dari website, lalu cek batas pages vs plan pemilik. */
  private async assertWithinPageLimit(websiteId: string): Promise<void> {
    const owner = await this.staffRepo.findOne({
      where: { website_id: websiteId, role: 'owner', is_active: true },
    });
    if (!owner) return; // tidak ada owner → jangan blok (defensif)

    const currentPages = await this.pageRepo.count({ where: { website_id: websiteId } });
    await this.planLimitService.checkCanAddPage(owner.user_id, currentPages);
  }

  async update(pageId: string, websiteId: string, dto: UpdatePageDto) {
    const page = await this.findOne(pageId);

    if (dto.slug && dto.slug !== page.slug) {
      const existing = await this.pageRepo.findOne({
        where: { website_id: websiteId, slug: dto.slug },
      });
      if (existing) throw new ConflictException(`Page slug "${dto.slug}" already exists`);
    }

    if (dto.is_home) {
      await this.pageRepo.update({ website_id: websiteId, is_home: true }, { is_home: false });
    }

    Object.assign(page, dto);
    if (dto.link_mode === 'external') {
      page.external_url = dto.external_url?.trim() || null;
    } else if (dto.link_mode === 'internal') {
      page.external_url = null;
    }
    return this.pageRepo.save(page);
  }

  async reorder(websiteId: string, dto: ReorderPagesDto) {
    const pages = await this.pageRepo.find({
      where: { id: In(dto.page_ids), website_id: websiteId },
    });

    if (pages.length !== dto.page_ids.length) {
      throw new NotFoundException('One or more pages not found');
    }

    const updates = dto.page_ids.map((id, index) => this.pageRepo.update(id, { order: index }));
    await Promise.all(updates);

    return this.findAll(websiteId);
  }

  async remove(pageId: string) {
    const page = await this.findOne(pageId);
    await this.pageRepo.remove(page);
    return { deleted: true };
  }
}
