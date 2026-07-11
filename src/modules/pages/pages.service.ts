import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { WebsitePage } from '../../entities';
import { CreatePageDto } from './dto/create-page.dto';
import { UpdatePageDto } from './dto/update-page.dto';
import { ReorderPagesDto } from './dto/reorder-pages.dto';

@Injectable()
export class PagesService {
  constructor(
    @InjectRepository(WebsitePage)
    private readonly pageRepo: Repository<WebsitePage>,
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
    return page;
  }

  async create(websiteId: string, dto: CreatePageDto) {
    const existing = await this.pageRepo.findOne({
      where: { website_id: websiteId, slug: dto.slug },
    });
    if (existing) throw new ConflictException(`Page slug "${dto.slug}" already exists in this website`);

    if (dto.is_home) {
      await this.pageRepo.update({ website_id: websiteId, is_home: true }, { is_home: false });
    }

    const page = this.pageRepo.create({
      website_id: websiteId,
      title: dto.title,
      slug: dto.slug,
      content: dto.content ?? {},
      is_home: dto.is_home ?? false,
      placement: dto.placement ?? 'regular',
      order: dto.order ?? 0,
    });

    return this.pageRepo.save(page);
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
