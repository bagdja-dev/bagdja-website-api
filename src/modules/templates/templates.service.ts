import { Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ArrayContains, FindOptionsWhere, Repository } from 'typeorm';

import { WebsiteTemplate } from '../../entities';
import type { BusinessProfileId } from '../websites/business-profile.registry';

import { sectionSchemasFor } from './section-schema.registry';
import {
  isRendererSupportedBuiltinManifest,
  isTemplateManifest,
  type TemplateManifestResponse,
} from './template-manifest';

@Injectable()
export class TemplatesService {
  private readonly logger = new Logger(TemplatesService.name);

  constructor(
    @InjectRepository(WebsiteTemplate)
    private readonly templateRepo: Repository<WebsiteTemplate>,
  ) {}

  async findAll(businessProfile?: BusinessProfileId) {
    const where: FindOptionsWhere<WebsiteTemplate> = { is_active: true };
    if (businessProfile) where.business_profiles = ArrayContains([businessProfile]);
    const templates = await this.templateRepo.find({
      where,
      order: { name: 'ASC' },
    });
    return templates.filter((template) => {
      const supported = this.isPublishedManifest(template.manifest, template.slug);
      if (!supported) this.logger.warn(`Template "${template.slug}" disembunyikan karena belum didukung renderer.`);
      return supported;
    });
  }

  async findBySlug(slug: string) {
    const template = await this.templateRepo.findOne({ where: { slug } });
    if (!template || !template.is_active || !this.isPublishedManifest(template.manifest, template.slug)) {
      throw new NotFoundException('Template tidak tersedia pada renderer saat ini');
    }
    return template;
  }

  async findById(id: string) {
    const template = await this.templateRepo.findOne({ where: { id } });
    if (!template || !template.is_active || !this.isPublishedManifest(template.manifest, template.slug)) {
      throw new NotFoundException('Template tidak tersedia pada renderer saat ini');
    }
    return template;
  }

  /**
   * Manifest template + subset skema section yang didukungnya
   * (template-contract.md §3). 404 bila template tidak ada / belum punya
   * manifest; 500 bila jsonb manifest tidak sesuai kontrak (jangan kirim respons
   * tidak valid ke Studio/renderer).
   */
  async findManifestBySlug(slug: string): Promise<TemplateManifestResponse> {
    const template = await this.templateRepo.findOne({ where: { slug } });
    if (!template) throw new NotFoundException('Template not found');
    if (!template.manifest) {
      throw new NotFoundException(`Template "${slug}" belum memiliki manifest`);
    }
    if (!isTemplateManifest(template.manifest)) {
      this.logger.error(`Manifest template "${slug}" tidak sesuai kontrak`);
      throw new InternalServerErrorException(`Manifest template "${slug}" tidak valid`);
    }
    if (!template.is_active || !this.isPublishedManifest(template.manifest, template.slug)) {
      throw new NotFoundException(`Template "${slug}" belum tersedia pada renderer`);
    }
    const manifest = template.manifest;
    return { ...manifest, sectionSchemas: sectionSchemasFor(manifest.sections) };
  }

  private isPublishedManifest(value: unknown, slug: string): boolean {
    if (isRendererSupportedBuiltinManifest(value, slug)) return true;
    return isTemplateManifest(value) && !value.isBuiltin && value.slug === slug;
  }
}
