import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { WebsiteCategory } from '../../entities';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(WebsiteCategory)
    private readonly categoryRepo: Repository<WebsiteCategory>,
  ) {}

  async findAll(websiteId: string) {
    return this.categoryRepo.find({
      where: { website_id: websiteId },
      order: { sort_order: 'ASC', label: 'ASC' },
    });
  }

  async findOne(categoryId: string) {
    const category = await this.categoryRepo.findOne({ where: { id: categoryId } });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  private async assertLabelAvailable(websiteId: string, label: string, excludeId?: string) {
    const existing = await this.categoryRepo.findOne({ where: { website_id: websiteId, label: label.trim() } });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException(`Category "${label}" already exists in this website`);
    }
  }

  async create(websiteId: string, dto: CreateCategoryDto) {
    await this.assertLabelAvailable(websiteId, dto.label);

    const category = this.categoryRepo.create({
      website_id: websiteId,
      label: dto.label.trim(),
      description: dto.description?.trim() || null,
      images: dto.images ?? [],
      specifications: dto.specifications ?? {},
      estimation: Array.isArray(dto.estimation) ? dto.estimation : [],
      sort_order: dto.sort_order ?? 0,
      is_active: dto.is_active ?? true,
    });
    return this.categoryRepo.save(category);
  }

  async update(categoryId: string, websiteId: string, dto: UpdateCategoryDto) {
    const category = await this.findOne(categoryId);

    if (dto.label && dto.label.trim() !== category.label) {
      await this.assertLabelAvailable(websiteId, dto.label, categoryId);
    }

    Object.assign(category, {
      ...dto,
      label: dto.label?.trim() ?? category.label,
      description: dto.description !== undefined ? dto.description?.trim() || null : category.description,
      images: dto.images ?? category.images,
      specifications: dto.specifications ?? category.specifications,
      estimation: dto.estimation ?? category.estimation,
    });
    return this.categoryRepo.save(category);
  }

  async remove(categoryId: string) {
    const category = await this.findOne(categoryId);
    await this.categoryRepo.remove(category);
    return { deleted: true };
  }
}
