import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { WebsiteSection } from '../../entities';
import { CreateSectionDto } from './dto/create-section.dto';
import { UpdateSectionDto } from './dto/update-section.dto';

@Injectable()
export class SectionsService {
  constructor(
    @InjectRepository(WebsiteSection)
    private readonly sectionRepo: Repository<WebsiteSection>,
  ) {}

  async findByPage(pageId: string) {
    return this.sectionRepo.find({
      where: { page_id: pageId },
      order: { order: 'ASC', created_at: 'ASC' },
    });
  }

  async findOne(sectionId: string) {
    const section = await this.sectionRepo.findOne({ where: { id: sectionId } });
    if (!section) throw new NotFoundException('Section not found');
    return section;
  }

  async create(pageId: string, dto: CreateSectionDto) {
    const section = this.sectionRepo.create({
      page_id: pageId,
      type: dto.type,
      content: dto.content ?? {},
      order: dto.order ?? 0,
    });
    return this.sectionRepo.save(section);
  }

  async update(sectionId: string, dto: UpdateSectionDto) {
    const section = await this.findOne(sectionId);
    Object.assign(section, dto);
    return this.sectionRepo.save(section);
  }

  async remove(sectionId: string) {
    const section = await this.findOne(sectionId);
    await this.sectionRepo.remove(section);
    return { deleted: true };
  }

  async reorder(pageId: string, orderedIds: string[]) {
    const updates = orderedIds.map((id, index) =>
      this.sectionRepo.update(id, { order: index }),
    );
    await Promise.all(updates);
    return this.findByPage(pageId);
  }
}
