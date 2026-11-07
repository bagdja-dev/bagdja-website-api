import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { WebsiteSection } from '../../entities';
import { CreateSectionDto } from './dto/create-section.dto';
import { UpdateSectionDto } from './dto/update-section.dto';

/** Perbandingan nilai JSON tanpa peduli urutan key (jsonb Postgres mengurutkan ulang key object). */
export function isSameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => isSameJson(item, b[i]));
  }
  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;
  const keysA = Object.keys(objA).filter((k) => objA[k] !== undefined);
  const keysB = Object.keys(objB).filter((k) => objB[k] !== undefined);
  return keysA.length === keysB.length && keysA.every((k) => isSameJson(objA[k], objB[k]));
}

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
    // Section contoh template berhenti jadi "seed" begitu isinya benar-benar berubah
    // (onboarding-status.homeEdited). Ubah urutan saja tidak dihitung.
    const typeChanged = dto.type !== undefined && dto.type !== section.type;
    const contentChanged = dto.content !== undefined && !isSameJson(dto.content, section.content);
    Object.assign(section, dto);
    if (section.is_seed && (typeChanged || contentChanged)) section.is_seed = false;
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
