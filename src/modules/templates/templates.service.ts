import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { WebsiteTemplate } from '../../entities';

@Injectable()
export class TemplatesService {
  constructor(
    @InjectRepository(WebsiteTemplate)
    private readonly templateRepo: Repository<WebsiteTemplate>,
  ) {}

  async findAll() {
    return this.templateRepo.find({
      where: { is_active: true },
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
}
