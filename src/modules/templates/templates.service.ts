import { Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ArrayContains, FindOptionsWhere, Repository } from 'typeorm';

import { WebsiteTemplate } from '../../entities';
import type { BusinessProfileId } from '../websites/business-profile.registry';

import { sectionSchemasFor } from './section-schema.registry';
import { isTemplateManifest, type TemplateManifestResponse } from './template-manifest';

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
    return this.templateRepo.find({
      where,
      order: { name: 'ASC' },
    });
  }

  async findBySlug(slug: string) {
    const template = await this.templateRepo.findOne({ where: { slug } });
    if (!template) throw new NotFoundException('Template not found');
    return template;
  }

  async findById(id: string) {
    const template = await this.templateRepo.findOne({ where: { id } });
    if (!template) throw new NotFoundException('Template not found');
    return template;
  }

  /**
   * Manifest template + subset skema section yang didukungnya
   * (template-contract.md §3). 404 bila template tidak ada / belum punya
   * manifest; 500 bila jsonb manifest tidak sesuai kontrak (jangan kirim respons
   * tidak valid ke Studio/renderer).
   */
  async findManifestBySlug(slug: string): Promise<TemplateManifestResponse> {
    const template = await this.findBySlug(slug);
    if (!template.manifest) {
      throw new NotFoundException(`Template "${slug}" belum memiliki manifest`);
    }
    if (!isTemplateManifest(template.manifest)) {
      this.logger.error(`Manifest template "${slug}" tidak sesuai kontrak`);
      throw new InternalServerErrorException(`Manifest template "${slug}" tidak valid`);
    }
    const manifest = template.manifest;
    return { ...manifest, sectionSchemas: sectionSchemasFor(manifest.sections) };
  }
}
