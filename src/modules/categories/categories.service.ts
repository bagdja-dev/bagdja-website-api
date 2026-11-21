import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { WebsiteCategory, WebsiteCategoryTranslation, WebsiteLanguage } from '../../entities';

import { CategoryTranslationDto } from './dto/category-translation.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(WebsiteCategory)
    private readonly categoryRepo: Repository<WebsiteCategory>,
    @InjectRepository(WebsiteCategoryTranslation)
    private readonly translationRepo: Repository<WebsiteCategoryTranslation>,
    @InjectRepository(WebsiteLanguage)
    private readonly languageRepo: Repository<WebsiteLanguage>,
  ) {}

  async findAll(websiteId: string) {
    return this.categoryRepo.find({
      where: { website_id: websiteId },
      order: { sort_order: 'ASC', label: 'ASC' },
      relations: { translations: true },
    });
  }

  async findOne(categoryId: string, websiteId?: string) {
    const category = await this.categoryRepo.findOne({
      where: { id: categoryId, ...(websiteId ? { website_id: websiteId } : {}) },
      relations: { translations: true },
    });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  private async assertLabelAvailable(websiteId: string, label: string, excludeId?: string) {
    const existing = await this.categoryRepo.findOne({ where: { website_id: websiteId, label: label.trim() } });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException(`Category "${label}" already exists in this website`);
    }
  }

  private async assertIdentityNameAvailable(websiteId: string, identityName: string, excludeId?: string) {
    const existing = await this.categoryRepo.findOne({
      where: { website_id: websiteId, identity_name: identityName.trim() },
    });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException(`Category identity "${identityName}" already exists in this website`);
    }
  }

  async create(websiteId: string, dto: CreateCategoryDto) {
    await this.assertLabelAvailable(websiteId, dto.label);
    const identityName = dto.identity_name == null ? dto.label.trim() : dto.identity_name.trim();
    if (!identityName) throw new BadRequestException('Category identity name must not be empty');
    await this.assertIdentityNameAvailable(websiteId, identityName);

    const category = this.categoryRepo.create({
      website_id: websiteId,
      identity_name: identityName,
      label: dto.label.trim(),
      description: dto.description?.trim() || null,
      images: dto.images ?? [],
      specifications: dto.specifications ?? {},
      estimation: Array.isArray(dto.estimation) ? dto.estimation : [],
      sort_order: dto.sort_order ?? 0,
      is_active: dto.is_active ?? true,
    });
    const saved = await this.categoryRepo.save(category);
    return this.findOne(saved.id, websiteId);
  }

  async update(categoryId: string, websiteId: string, dto: UpdateCategoryDto) {
    const category = await this.findOne(categoryId, websiteId);
    if (dto.identity_name != null && !dto.identity_name.trim()) {
      throw new BadRequestException('Category identity name must not be empty');
    }

    if (dto.label && dto.label.trim() !== category.label) {
      await this.assertLabelAvailable(websiteId, dto.label, categoryId);
    }
    if (dto.identity_name && dto.identity_name.trim() !== category.identity_name) {
      await this.assertIdentityNameAvailable(websiteId, dto.identity_name, categoryId);
    }

    Object.assign(category, {
      ...dto,
      identity_name: dto.identity_name?.trim() || category.identity_name,
      label: dto.label?.trim() ?? category.label,
      description: dto.description !== undefined ? dto.description?.trim() || null : category.description,
      images: dto.images ?? category.images,
      specifications: dto.specifications ?? category.specifications,
      estimation: dto.estimation ?? category.estimation,
    });
    await this.categoryRepo.save(category);
    return this.findOne(categoryId, websiteId);
  }

  async upsertTranslation(websiteId: string, categoryId: string, locale: string, dto: CategoryTranslationDto) {
    const category = await this.findOne(categoryId, websiteId);
    const language = await this.languageRepo.findOne({ where: { website_id: websiteId, locale } });
    if (!language?.is_active) throw new BadRequestException(`Locale '${locale}' is not active for this website`);
    const label = dto.label.trim();
    if (!label) throw new BadRequestException('Category translation label must not be empty');

    let translation = await this.translationRepo.findOne({ where: { category_id: category.id, locale } });
    if (!translation) {
      translation = this.translationRepo.create({ website_id: websiteId, category_id: category.id, locale });
    }
    translation.label = label;
    translation.description = dto.description?.trim() || null;
    return this.translationRepo.save(translation);
  }

  async remove(websiteId: string, categoryId: string) {
    const category = await this.findOne(categoryId, websiteId);
    await this.categoryRepo.remove(category);
    return { deleted: true };
  }
}
