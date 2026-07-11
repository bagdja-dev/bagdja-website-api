import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { TenantStaff, Website, WebsiteTemplate } from '../../entities';
import { extractTemplateTheme, sanitizeWebsiteTheme } from '../../common/website-theme';
import { CreateWebsiteDto } from './dto/create-website.dto';
import { UpdateWebsiteDto } from './dto/update-website.dto';
import { WebsiteBootstrapService } from './website-bootstrap.service';

@Injectable()
export class WebsitesService {
  constructor(
    @InjectRepository(Website)
    private readonly websiteRepo: Repository<Website>,
    @InjectRepository(TenantStaff)
    private readonly staffRepo: Repository<TenantStaff>,
    @InjectRepository(WebsiteTemplate)
    private readonly templateRepo: Repository<WebsiteTemplate>,
    private readonly bootstrapService: WebsiteBootstrapService,
  ) {}

  async findWebsitesByUserId(userId: string) {
    const staffRecords = await this.staffRepo.find({
      where: { user_id: userId, is_active: true },
      relations: ['website'],
      order: { created_at: 'DESC' },
    });

    return staffRecords.map((staff) => ({
      website: staff.website,
      role: staff.role,
      is_active: staff.is_active,
    }));
  }

  async findById(websiteId: string) {
    const website = await this.websiteRepo.findOne({
      where: { id: websiteId },
      relations: ['template'],
    });
    if (!website) throw new NotFoundException('Website not found');
    return website;
  }

  async findBySlug(slug: string) {
    const website = await this.websiteRepo.findOne({
      where: { slug },
      relations: ['template', 'pages'],
    });
    if (!website) throw new NotFoundException('Website not found');
    return website;
  }

  async create(userId: string, dto: CreateWebsiteDto, userEmail?: string) {
    const existing = await this.websiteRepo.findOne({ where: { slug: dto.slug } });
    if (existing) throw new ConflictException(`Slug "${dto.slug}" is already taken`);

    let theme: Record<string, unknown> = {};
    if (dto.theme) {
      theme = sanitizeWebsiteTheme(dto.theme) as Record<string, unknown>;
    } else if (dto.template_id) {
      const template = await this.templateRepo.findOne({ where: { id: dto.template_id } });
      theme = extractTemplateTheme(template?.structure ?? null) as Record<string, unknown>;
    }

    const website = this.websiteRepo.create({
      name: dto.name,
      slug: dto.slug,
      domain: dto.domain ?? null,
      template_id: dto.template_id ?? null,
      tagline: dto.tagline ?? null,
      logo_url: dto.logo_url ?? null,
      whatsapp: dto.whatsapp ?? null,
      phone: dto.phone ?? null,
      email: dto.email ?? null,
      social_links: {},
      opening_hours: {},
      theme,
    });

    const saved = await this.websiteRepo.save(website);

    const ownerStaff = this.staffRepo.create({
      website_id: saved.id,
      user_id: userId,
      email: userEmail ?? null,
      role: 'owner',
      is_active: true,
      accepted_at: new Date(),
    });
    await this.staffRepo.save(ownerStaff);

    await this.bootstrapService.bootstrap(saved, dto.template_id ?? null);

    return this.findById(saved.id);
  }

  async update(websiteId: string, dto: UpdateWebsiteDto) {
    const website = await this.findById(websiteId);

    if (dto.slug && dto.slug !== website.slug) {
      const existing = await this.websiteRepo.findOne({ where: { slug: dto.slug } });
      if (existing) throw new ConflictException(`Slug "${dto.slug}" is already taken`);
    }

    if (dto.theme !== undefined) {
      website.theme = sanitizeWebsiteTheme(dto.theme) as Record<string, unknown>;
    }

    const { theme: _theme, ...rest } = dto;
    Object.assign(website, rest);
    return this.websiteRepo.save(website);
  }

  async remove(websiteId: string) {
    const website = await this.findById(websiteId);
    await this.websiteRepo.remove(website);
    return { deleted: true };
  }
}
