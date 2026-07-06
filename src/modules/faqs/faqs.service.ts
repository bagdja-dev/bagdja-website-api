import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { WebsiteFaq } from '../../entities';
import { CreateFaqDto } from './dto/create-faq.dto';
import { UpdateFaqDto } from './dto/update-faq.dto';
import { ReorderFaqsDto } from './dto/reorder-faqs.dto';

@Injectable()
export class FaqsService {
  constructor(
    @InjectRepository(WebsiteFaq)
    private readonly faqRepo: Repository<WebsiteFaq>,
  ) {}

  async findAll(websiteId: string, category?: string) {
    return this.faqRepo.find({
      where: {
        website_id: websiteId,
        ...(category ? { category } : {}),
      },
      order: { sort_order: 'ASC', created_at: 'ASC' },
    });
  }

  async findOne(faqId: string) {
    const faq = await this.faqRepo.findOne({ where: { id: faqId } });
    if (!faq) throw new NotFoundException('FAQ not found');
    return faq;
  }

  async create(websiteId: string, dto: CreateFaqDto) {
    const faq = this.faqRepo.create({
      website_id: websiteId,
      question: dto.question,
      answer: dto.answer,
      category: dto.category ?? null,
      sort_order: dto.sort_order ?? 0,
      is_public: dto.is_public ?? true,
      is_active: dto.is_active ?? true,
      metadata: dto.metadata ?? {},
    });
    return this.faqRepo.save(faq);
  }

  async update(faqId: string, dto: UpdateFaqDto) {
    const faq = await this.findOne(faqId);
    Object.assign(faq, dto);
    return this.faqRepo.save(faq);
  }

  async reorder(websiteId: string, dto: ReorderFaqsDto) {
    const faqs = await this.faqRepo.find({
      where: { id: In(dto.faq_ids), website_id: websiteId },
    });

    if (faqs.length !== dto.faq_ids.length) {
      throw new NotFoundException('One or more FAQs not found');
    }

    const updates = dto.faq_ids.map((id, index) =>
      this.faqRepo.update(id, { sort_order: index }),
    );
    await Promise.all(updates);

    return this.findAll(websiteId);
  }

  async remove(faqId: string) {
    const faq = await this.findOne(faqId);
    await this.faqRepo.remove(faq);
    return { deleted: true };
  }
}
