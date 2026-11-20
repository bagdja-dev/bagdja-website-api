import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { sanitizeRichText } from '../../common/rich-text';
import {
  Website,
  WebsiteLanguage,
  WebsiteLocation,
  WebsitePartner,
  WebsitePartnerAccount,
  WebsitePartnerCategory,
  WebsitePartnerCategoryAssignment,
  WebsitePartnerTranslation,
  WebsiteVendorLocation,
  WebsitePortfolioProject,
  WebsitePortfolioProjectTranslation,
} from '../../entities';
import type { WebsitePortfolioPhoto } from '../../entities/website-portfolio-project.entity';

import {
  ClientTranslationDto,
  CreateClientDto,
  CreatePortfolioProjectDto,
  PortfolioPhotoDto,
  PortfolioProjectTranslationDto,
  CreatePartnerAccountDto,
  CreatePartnerDto,
  PartnerTranslationDto,
  UpdatePartnerDto,
  UpsertPartnerCategoryDto,
  UpdateClientDto,
  UpdatePortfolioProjectDto,
  UpsertWebsiteLanguageDto,
} from './dto/company-profile.dto';

@Injectable()
export class CompanyProfileService {
  constructor(
    @InjectRepository(Website) private readonly websiteRepo: Repository<Website>,
    @InjectRepository(WebsiteLanguage) private readonly languageRepo: Repository<WebsiteLanguage>,
    @InjectRepository(WebsitePartner) private readonly partnerRepo: Repository<WebsitePartner>,
    @InjectRepository(WebsitePartnerTranslation) private readonly partnerTranslationRepo: Repository<WebsitePartnerTranslation>,
    @InjectRepository(WebsitePartnerCategory) private readonly partnerCategoryRepo: Repository<WebsitePartnerCategory>,
    @InjectRepository(WebsitePartnerCategoryAssignment) private readonly partnerCategoryAssignmentRepo: Repository<WebsitePartnerCategoryAssignment>,
    @InjectRepository(WebsitePartnerAccount) private readonly partnerAccountRepo: Repository<WebsitePartnerAccount>,
    @InjectRepository(WebsiteLocation) private readonly locationRepo: Repository<WebsiteLocation>,
    @InjectRepository(WebsiteVendorLocation) private readonly partnerLocationRepo: Repository<WebsiteVendorLocation>,
    @InjectRepository(WebsitePortfolioProject) private readonly portfolioRepo: Repository<WebsitePortfolioProject>,
    @InjectRepository(WebsitePortfolioProjectTranslation) private readonly portfolioTranslationRepo: Repository<WebsitePortfolioProjectTranslation>,
  ) {}

  private assertLocale(locale: string) {
    if (!/^[a-z]{2}(?:-[A-Z]{2})?$/.test(locale)) {
      throw new BadRequestException('Locale must use a valid short BCP-47 code');
    }
  }

  private assertExternalUrl(value: string | null | undefined) {
    if (!value) return;
    try {
      const url = new URL(value);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error();
    } catch {
      throw new BadRequestException('External URL must use http or https');
    }
  }

  private assertPortfolioMedia(photos: PortfolioPhotoDto[] | undefined, videoUrl?: string | null, model3dUrl?: string | null) {
    if (photos && photos.length > 4) throw new BadRequestException('Portfolio projects can have at most 4 photos');
    for (const photo of photos ?? []) this.assertExternalUrl(photo.url);
    this.assertExternalUrl(videoUrl);
    this.assertExternalUrl(model3dUrl);
  }

  private normalizePortfolioPhotos(photos: PortfolioPhotoDto[] | undefined): WebsitePortfolioPhoto[] {
    return (photos ?? []).map((photo) => ({
      url: photo.url.trim(),
      alt: photo.alt?.trim() ?? '',
      caption: photo.caption?.trim() ?? '',
    }));
  }

  private updatePortfolioPhotosWithLegacyCover(photos: WebsitePortfolioPhoto[] | undefined, coverImage: string | null): WebsitePortfolioPhoto[] {
    const currentPhotos = photos ?? [];
    if (!coverImage) return currentPhotos.slice(1);
    const [firstPhoto, ...remainingPhotos] = currentPhotos;
    return [{ url: coverImage, alt: firstPhoto?.alt ?? '', caption: firstPhoto?.caption ?? '' }, ...remainingPhotos];
  }

  private normalizePortfolioTags(tags: string[] | undefined): string[] {
    const uniqueTags = new Map<string, string>();
    for (const tag of tags ?? []) {
      const normalized = tag.trim();
      if (normalized) uniqueTags.set(normalized.toLocaleLowerCase(), normalized);
    }
    return [...uniqueTags.values()];
  }

  private async assertWebsite(websiteId: string) {
    const website = await this.websiteRepo.findOne({ where: { id: websiteId } });
    if (!website) throw new NotFoundException('Website not found');
    return website;
  }

  private async assertLanguage(websiteId: string, locale: string) {
    this.assertLocale(locale);
    const language = await this.languageRepo.findOne({ where: { website_id: websiteId, locale } });
    if (!language?.is_active) throw new BadRequestException(`Locale '${locale}' is not active for this website`);
    return language;
  }

  private async publicLocaleOrder(websiteId: string, explicitLocale?: string, acceptLanguage?: string): Promise<string[]> {
    const languages = await this.languageRepo.find({
      where: { website_id: websiteId, is_active: true },
      order: { sort_order: 'ASC', locale: 'ASC' },
    });
    const activeLocales = languages.map((language) => language.locale);
    const preferred: string[] = [];
    const addMatch = (candidate: string) => {
      const normalized = candidate.toLowerCase();
      const base = normalized.split('-')[0];
      const match = activeLocales.find((locale) => locale.toLowerCase() === normalized)
        ?? activeLocales.find((locale) => locale.toLowerCase() === base)
        ?? activeLocales.find((locale) => locale.toLowerCase().startsWith(`${base}-`));
      if (match && !preferred.includes(match)) preferred.push(match);
    };

    if (explicitLocale) {
      addMatch(explicitLocale);
    } else {
      const accepted = (acceptLanguage ?? '')
        .split(',')
        .map((item, index) => {
          const [tag, ...params] = item.trim().split(';');
          const qualityParam = params.find((param) => param.trim().startsWith('q='));
          const quality = qualityParam ? Number(qualityParam.trim().slice(2)) : 1;
          return { tag: tag.trim(), quality: Number.isFinite(quality) ? quality : 0, index };
        })
        .filter((item) => item.tag && item.tag !== '*' && item.quality > 0)
        .sort((a, b) => b.quality - a.quality || a.index - b.index);
      for (const item of accepted) addMatch(item.tag);
    }

    const fallback = languages.find((language) => language.is_default)?.locale
      ?? activeLocales.find((locale) => locale === 'id')
      ?? activeLocales[0];
    if (fallback && !preferred.includes(fallback)) preferred.push(fallback);
    for (const locale of activeLocales) {
      if (!preferred.includes(locale)) preferred.push(locale);
    }
    return preferred.length ? preferred : ['id'];
  }

  async findLanguages(websiteId: string) {
    await this.assertWebsite(websiteId);
    return this.languageRepo.find({ where: { website_id: websiteId }, order: { sort_order: 'ASC', locale: 'ASC' } });
  }

  async upsertLanguage(websiteId: string, dto: UpsertWebsiteLanguageDto) {
    await this.assertWebsite(websiteId);
    this.assertLocale(dto.locale);

    if (dto.is_default) {
      await this.languageRepo.update({ website_id: websiteId, is_default: true }, { is_default: false });
    }

    let language = await this.languageRepo.findOne({ where: { website_id: websiteId, locale: dto.locale } });
    if (!language) {
      language = this.languageRepo.create({ website_id: websiteId, locale: dto.locale, label: dto.label.trim(), is_default: false, is_active: dto.is_active ?? true, sort_order: dto.sort_order ?? 0 });
    } else {
      Object.assign(language, { label: dto.label.trim(), is_default: dto.is_default ?? language.is_default, is_active: dto.is_active ?? language.is_active, sort_order: dto.sort_order ?? language.sort_order });
    }

    if (language.is_default) await this.languageRepo.update({ website_id: websiteId, is_default: true }, { is_default: false });
    if (language.is_default) language.is_default = true;
    return this.languageRepo.save(language);
  }

  async removeLanguage(websiteId: string, locale: string) {
    await this.assertWebsite(websiteId);
    this.assertLocale(locale);
    const language = await this.languageRepo.findOne({ where: { website_id: websiteId, locale } });
    if (!language) throw new NotFoundException('Language not found');
    if (language.is_default) throw new BadRequestException('Cannot remove the default language');
    await this.languageRepo.remove(language);
    return { deleted: true };
  }

  async findClients(websiteId: string) {
    await this.assertWebsite(websiteId);
    return this.findPartners(websiteId, { is_client: true });
  }

  async findPartners(websiteId: string, roleFilter: { is_client?: boolean; is_provider?: boolean } = {}) {
    await this.assertWebsite(websiteId);
    const partners = await this.partnerRepo.find({
      where: { website_id: websiteId, ...roleFilter },
      order: { name: 'ASC', created_at: 'ASC' },
      relations: ['vendor_locations', 'vendor_locations.location'],
    });
    if (!partners.length) return [];
    const partnerIds = partners.map((partner) => partner.id);
    const [translations, assignments, accounts] = await Promise.all([
      this.partnerTranslationRepo.find({ where: { partner_id: In(partnerIds) } }),
      this.partnerCategoryAssignmentRepo.find({ where: { partner_id: In(partnerIds) } }),
      this.partnerAccountRepo.find({ where: { partner_id: In(partnerIds) } }),
    ]);
    const categoryIds = [...new Set(assignments.map((assignment) => assignment.category_id))];
    const categories = categoryIds.length
      ? await this.partnerCategoryRepo.find({ where: { id: In(categoryIds), website_id: websiteId } })
      : [];
    const categoryMap = new Map(categories.map((category) => [category.id, category]));
    return partners.map((partner) => ({
      ...partner,
      translations: translations.filter((translation) => translation.partner_id === partner.id),
      categories: assignments
        .filter((assignment) => assignment.partner_id === partner.id)
        .map((assignment) => categoryMap.get(assignment.category_id))
        .filter((category) => category !== undefined),
      bagdja_accounts: accounts.filter((account) => account.partner_id === partner.id),
    }));
  }

  private async setPartnerLocations(websiteId: string, partnerId: string, locationIds: string[]) {
    const uniqueIds = [...new Set(locationIds)];
    const locations = uniqueIds.length
      ? await this.locationRepo.find({ where: { id: In(uniqueIds), website_id: websiteId } })
      : [];
    if (locations.length !== uniqueIds.length) throw new BadRequestException('One or more selected locations do not belong to this website');
    await this.partnerLocationRepo.delete({ vendor_id: partnerId });
    if (uniqueIds.length) {
      await this.partnerLocationRepo.save(uniqueIds.map((location_id) => ({ vendor_id: partnerId, location_id, metadata: {} })));
    }
  }

  async createPartner(websiteId: string, dto: CreatePartnerDto) {
    await this.assertWebsite(websiteId);
    if (!dto.is_client && !dto.is_provider) throw new BadRequestException('Partner must have at least one role');
    if (!dto.is_provider && dto.location_ids?.length) throw new BadRequestException('Only providers can be assigned service locations');
    this.assertExternalUrl(dto.website_url);
    const partner = await this.partnerRepo.save(this.partnerRepo.create({
      website_id: websiteId,
      name: dto.name.trim(),
      logo_url: dto.logo_url?.trim() || null,
      website_url: dto.website_url?.trim() || null,
      contact_whatsapp: dto.contact_whatsapp?.trim() || null,
      notes: dto.notes?.trim() || null,
      is_client: dto.is_client,
      is_provider: dto.is_provider,
      is_public: dto.is_public ?? false,
      is_active: dto.is_active ?? true,
      status: dto.is_active === false ? 'inactive' : 'active',
      sort_order: dto.sort_order ?? 0,
    }));
    if (dto.category_ids?.length) await this.setPartnerCategories(websiteId, partner.id, dto.category_ids);
    if (dto.location_ids?.length) await this.setPartnerLocations(websiteId, partner.id, dto.location_ids);
    return this.findPartner(websiteId, partner.id);
  }

  async updatePartner(websiteId: string, partnerId: string, dto: UpdatePartnerDto) {
    const partner = await this.partnerRepo.findOne({ where: { id: partnerId, website_id: websiteId } });
    if (!partner) throw new NotFoundException('Partner not found');
    const isClient = dto.is_client ?? partner.is_client;
    const isProvider = dto.is_provider ?? partner.is_provider;
    if (!isClient && !isProvider) throw new BadRequestException('Partner must have at least one role');
    if (!isProvider && dto.location_ids?.length) throw new BadRequestException('Only providers can be assigned service locations');
    this.assertExternalUrl(dto.website_url);
    Object.assign(partner, {
      name: dto.name?.trim() ?? partner.name,
      logo_url: dto.logo_url !== undefined ? dto.logo_url?.trim() || null : partner.logo_url,
      website_url: dto.website_url !== undefined ? dto.website_url?.trim() || null : partner.website_url,
      contact_whatsapp: dto.contact_whatsapp !== undefined ? dto.contact_whatsapp?.trim() || null : partner.contact_whatsapp,
      notes: dto.notes !== undefined ? dto.notes?.trim() || null : partner.notes,
      is_client: isClient,
      is_provider: isProvider,
      is_public: dto.is_public ?? partner.is_public,
      is_active: dto.is_active ?? partner.is_active,
      status: dto.is_active !== undefined ? (dto.is_active ? 'active' : 'inactive') : partner.status,
      sort_order: dto.sort_order ?? partner.sort_order,
    });
    await this.partnerRepo.save(partner);
    if (dto.category_ids !== undefined) await this.setPartnerCategories(websiteId, partnerId, dto.category_ids);
    if (dto.location_ids !== undefined) {
      await this.setPartnerLocations(websiteId, partnerId, dto.location_ids);
    }
    return this.findPartner(websiteId, partnerId);
  }

  async removePartner(websiteId: string, partnerId: string) {
    const partner = await this.partnerRepo.findOne({ where: { id: partnerId, website_id: websiteId } });
    if (!partner) throw new NotFoundException('Partner not found');
    partner.is_active = false;
    partner.is_public = false;
    partner.status = 'inactive';
    await this.partnerRepo.save(partner);
    return { deleted: true, status: 'inactive' };
  }

  async findPartner(websiteId: string, partnerId: string) {
    const result = (await this.findPartners(websiteId)).find((item) => item.id === partnerId);
    if (!result) throw new NotFoundException('Partner not found');
    return result;
  }

  private async setPartnerCategories(websiteId: string, partnerId: string, categoryIds: string[]) {
    const uniqueIds = [...new Set(categoryIds)];
    const categories = uniqueIds.length
      ? await this.partnerCategoryRepo.find({ where: { id: In(uniqueIds), website_id: websiteId } })
      : [];
    if (categories.length !== uniqueIds.length) throw new BadRequestException('One or more categories do not belong to this website');
    await this.partnerCategoryAssignmentRepo.delete({ partner_id: partnerId });
    if (uniqueIds.length) {
      await this.partnerCategoryAssignmentRepo.save(uniqueIds.map((category_id) => ({ partner_id: partnerId, category_id })));
    }
  }

  async findPartnerCategories(websiteId: string) {
    await this.assertWebsite(websiteId);
    return this.partnerCategoryRepo.find({ where: { website_id: websiteId }, order: { sort_order: 'ASC', name: 'ASC' } });
  }

  async upsertPartnerCategory(websiteId: string, categoryId: string | null, dto: UpsertPartnerCategoryDto) {
    await this.assertWebsite(websiteId);
    const slug = dto.slug?.trim() || dto.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!slug) throw new BadRequestException('Partner category slug or name is required');
    const existing = await this.partnerCategoryRepo.findOne({ where: { website_id: websiteId, slug } });
    if (existing && existing.id !== categoryId) throw new ConflictException(`Partner category '${slug}' already exists`);
    const category = categoryId
      ? await this.partnerCategoryRepo.findOne({ where: { id: categoryId, website_id: websiteId } })
      : null;
    if (categoryId && !category) throw new NotFoundException('Partner category not found');
    const entity = category ?? this.partnerCategoryRepo.create({ website_id: websiteId });
    Object.assign(entity, {
      slug,
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      is_public: dto.is_public ?? entity.is_public ?? false,
      is_active: dto.is_active ?? entity.is_active ?? true,
      sort_order: dto.sort_order ?? entity.sort_order ?? 0,
    });
    return this.partnerCategoryRepo.save(entity);
  }

  async createPartnerAccount(websiteId: string, partnerId: string, dto: CreatePartnerAccountDto) {
    const partner = await this.partnerRepo.findOne({ where: { id: partnerId, website_id: websiteId } });
    if (!partner) throw new NotFoundException('Partner not found');
    const existing = await this.partnerAccountRepo.findOne({
      where: { partner_id: partnerId, bagdja_account_id: dto.bagdja_account_id, role: dto.role.trim() },
    });
    if (existing) return existing;
    return this.partnerAccountRepo.save(this.partnerAccountRepo.create({
      partner_id: partnerId,
      bagdja_account_id: dto.bagdja_account_id,
      role: dto.role.trim(),
      status: 'active',
    }));
  }

  async createClient(websiteId: string, dto: CreateClientDto) {
    await this.assertWebsite(websiteId);
    this.assertExternalUrl(dto.website_url);
    const client = this.partnerRepo.create({
      website_id: websiteId,
      name: dto.name?.trim() || 'Client',
      logo_url: dto.logo_url?.trim() || null,
      website_url: dto.website_url?.trim() || null,
      is_client: true,
      is_provider: dto.is_provider ?? false,
      is_public: dto.is_public ?? true,
      is_active: dto.is_active ?? true,
      status: dto.is_active === false ? 'inactive' : 'active',
      sort_order: dto.sort_order ?? 0,
    });
    return this.partnerRepo.save(client);
  }

  private async findClient(websiteId: string, clientId: string) {
    const client = await this.partnerRepo.findOne({ where: { id: clientId, website_id: websiteId, is_client: true } });
    if (!client) throw new NotFoundException('Client not found');
    return client;
  }

  async updateClient(websiteId: string, clientId: string, dto: UpdateClientDto) {
    const client = await this.findClient(websiteId, clientId);
    this.assertExternalUrl(dto.website_url);
    Object.assign(client, {
      logo_url: dto.logo_url !== undefined ? dto.logo_url?.trim() || null : client.logo_url,
      website_url: dto.website_url !== undefined ? dto.website_url?.trim() || null : client.website_url,
      is_active: dto.is_active ?? client.is_active,
      is_public: dto.is_public ?? client.is_public,
      is_provider: dto.is_provider ?? client.is_provider,
      status: dto.is_active !== undefined ? (dto.is_active ? 'active' : 'inactive') : client.status,
      sort_order: dto.sort_order ?? client.sort_order,
    });
    return this.partnerRepo.save(client);
  }

  async removeClient(websiteId: string, clientId: string) {
    const client = await this.findClient(websiteId, clientId);
    client.is_public = false;
    if (!client.is_provider) {
      client.is_active = false;
      client.status = 'inactive';
    }
    await this.partnerRepo.save(client);
    return { deleted: true };
  }

  async upsertClientTranslation(websiteId: string, clientId: string, locale: string, dto: ClientTranslationDto) {
    return this.upsertPartnerTranslation(websiteId, clientId, locale, dto);
  }

  async upsertPartnerTranslation(websiteId: string, partnerId: string, locale: string, dto: PartnerTranslationDto) {
    const partner = await this.partnerRepo.findOne({ where: { id: partnerId, website_id: websiteId } });
    if (!partner) throw new NotFoundException('Partner not found');
    await this.assertLanguage(websiteId, locale);
    if (dto.locale !== locale) throw new BadRequestException('Locale in body must match URL locale');

    let translation = await this.partnerTranslationRepo.findOne({ where: { partner_id: partnerId, locale } });
    if (!translation) translation = this.partnerTranslationRepo.create({ website_id: websiteId, partner_id: partnerId, locale, name: dto.name.trim(), description: dto.description?.trim() || null });
    else Object.assign(translation, { name: dto.name.trim(), description: dto.description?.trim() || null });
    const saved = await this.partnerTranslationRepo.save(translation);
    const defaultLanguage = await this.languageRepo.findOne({ where: { website_id: websiteId, is_default: true } });
    if (defaultLanguage?.locale === locale) {
      await this.partnerRepo.update({ id: partnerId, website_id: websiteId }, { name: dto.name.trim() });
    }
    return saved;
  }

  async findPortfolioProjects(websiteId: string) {
    await this.assertWebsite(websiteId);
    const projects = await this.portfolioRepo.find({ where: { website_id: websiteId }, order: { sort_order: 'ASC', created_at: 'ASC' } });
    const translations = await this.portfolioTranslationRepo.find({ where: { website_id: websiteId } });
    return projects.map((project) => ({ ...project, translations: translations.filter((item) => item.project_id === project.id) }));
  }

  async findPortfolioProject(websiteId: string, projectId: string) {
    const project = await this.portfolioRepo.findOne({ where: { id: projectId, website_id: websiteId } });
    if (!project) throw new NotFoundException('Portfolio project not found');
    const translations = await this.portfolioTranslationRepo.find({ where: { project_id: projectId, website_id: websiteId } });
    return { ...project, translations };
  }

  async createPortfolioProject(websiteId: string, dto: CreatePortfolioProjectDto) {
    await this.assertWebsite(websiteId);
    this.assertExternalUrl(dto.project_url);
    this.assertPortfolioMedia(dto.photos, dto.video_url, dto.model3d_url);

    if (dto.client_id) {
      await this.findClient(websiteId, dto.client_id);
    }

    const slug = dto.slug?.trim() || dto.title?.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!slug) throw new BadRequestException('Portfolio slug or title is required');

    const existing = await this.portfolioRepo.findOne({ where: { website_id: websiteId, slug } });
    if (existing) throw new ConflictException(`Portfolio slug '${slug}' already exists in this website`);
    const tags = this.normalizePortfolioTags(dto.tags);
    if (tags.length > 20) throw new BadRequestException('Portfolio projects can have at most 20 tags');

    const project = this.portfolioRepo.create({
      website_id: websiteId,
      name: dto.name?.trim() || dto.title?.trim() || slug,
      slug,
      client_id: dto.client_id || null,
      tags,
      cover_image: this.normalizePortfolioPhotos(dto.photos)[0]?.url ?? dto.cover_image?.trim() ?? null,
      photos: this.normalizePortfolioPhotos(dto.photos),
      video_url: dto.video_url?.trim() || null,
      model3d_url: dto.model3d_url?.trim() || null,
      project_url: dto.project_url?.trim() || null,
      project_type: dto.project_type?.trim() || null,
      year: dto.year ?? null,
      sort_order: dto.sort_order ?? 0,
      is_published: dto.is_published ?? true,
      seo_no_index: dto.seo_no_index ?? false,
    });
    const saved = await this.portfolioRepo.save(project);

    await this.upsertPortfolioTranslation(websiteId, saved.id, 'id', {
      locale: 'id',
      slug,
      title: dto.title?.trim() || slug,
      excerpt: dto.excerpt ?? dto.summary,
      detail: dto.detail ?? dto.description,
      summary: dto.excerpt ?? dto.summary,
      description: dto.detail ?? dto.description,
      seo_title: dto.seo_title,
      seo_description: dto.seo_description,
      seo_image: dto.seo_image,
      seo_no_index: dto.seo_no_index,
      is_published: dto.is_published,
    });
    return this.findPortfolioProject(websiteId, saved.id);
  }

  async updatePortfolioProject(websiteId: string, projectId: string, dto: UpdatePortfolioProjectDto) {
    const project = await this.portfolioRepo.findOne({ where: { id: projectId, website_id: websiteId } });
    if (!project) throw new NotFoundException('Portfolio project not found');
    this.assertExternalUrl(dto.project_url);
    this.assertPortfolioMedia(dto.photos, dto.video_url, dto.model3d_url);
    if (dto.client_id) await this.findClient(websiteId, dto.client_id);

    const photos = dto.photos !== undefined
      ? this.normalizePortfolioPhotos(dto.photos)
      : dto.cover_image !== undefined
        ? this.updatePortfolioPhotosWithLegacyCover(project.photos, dto.cover_image?.trim() || null)
        : project.photos;
    const coverImage = dto.photos !== undefined
      ? photos[0]?.url ?? null
      : dto.cover_image !== undefined ? dto.cover_image?.trim() || null : project.cover_image;
    const tags = dto.tags !== undefined ? this.normalizePortfolioTags(dto.tags) : project.tags ?? [];
    if (tags.length > 20) throw new BadRequestException('Portfolio projects can have at most 20 tags');

    Object.assign(project, {
      name: dto.name !== undefined ? dto.name.trim() || project.name : project.name,
      client_id: dto.client_id !== undefined ? dto.client_id || null : project.client_id,
      tags,
      cover_image: coverImage,
      photos,
      video_url: dto.video_url !== undefined ? dto.video_url?.trim() || null : project.video_url,
      model3d_url: dto.model3d_url !== undefined ? dto.model3d_url?.trim() || null : project.model3d_url,
      project_url: dto.project_url !== undefined ? dto.project_url?.trim() || null : project.project_url,
      project_type: dto.project_type !== undefined ? dto.project_type?.trim() || null : project.project_type,
      year: dto.year ?? project.year,
      sort_order: dto.sort_order ?? project.sort_order,
      is_published: dto.is_published ?? project.is_published,
      seo_no_index: dto.seo_no_index ?? project.seo_no_index,
    });
    const saved = await this.portfolioRepo.save(project);
    if (dto.tags !== undefined) {
      await this.portfolioTranslationRepo.update(
        { project_id: projectId, website_id: websiteId },
        { tags },
      );
    }
    return saved;
  }

  async removePortfolioProject(websiteId: string, projectId: string) {
    const project = await this.portfolioRepo.findOne({ where: { id: projectId, website_id: websiteId } });
    if (!project) throw new NotFoundException('Portfolio project not found');
    await this.portfolioRepo.remove(project);
    return { deleted: true };
  }

  async upsertPortfolioTranslation(websiteId: string, projectId: string, locale: string, dto: PortfolioProjectTranslationDto) {
    const project = await this.portfolioRepo.findOne({ where: { id: projectId, website_id: websiteId } });
    if (!project) throw new NotFoundException('Portfolio project not found');
    await this.assertLanguage(websiteId, locale);
    if (dto.locale !== locale) throw new BadRequestException('Locale in body must match URL locale');

    const existingSlug = await this.portfolioTranslationRepo.findOne({ where: { website_id: websiteId, locale, slug: dto.slug } });
    if (existingSlug && existingSlug.project_id !== projectId) throw new ConflictException(`Portfolio slug '${dto.slug}' already exists for locale '${locale}'`);

    let translation = await this.portfolioTranslationRepo.findOne({ where: { project_id: projectId, locale } });
    const excerpt = dto.excerpt ?? dto.summary;
    const detail = dto.detail ?? dto.description;
    const normalizedExcerpt = excerpt?.trim() || null;
    const normalizedDetail = sanitizeRichText(detail, 'product');
    if (!translation) translation = this.portfolioTranslationRepo.create({
      website_id: websiteId, project_id: projectId, locale, slug: dto.slug, title: dto.title.trim(),
      excerpt: normalizedExcerpt, detail: normalizedDetail, tags: project.tags ?? [],
      summary: normalizedExcerpt, description: normalizedDetail,
      seo_title: dto.seo_title?.trim() || null, seo_description: dto.seo_description?.trim() || null, seo_image: dto.seo_image?.trim() || null,
      seo_no_index: dto.seo_no_index ?? project.seo_no_index, is_published: dto.is_published ?? project.is_published,
    });
    else Object.assign(translation, {
      slug: dto.slug, title: dto.title.trim(), excerpt: normalizedExcerpt, detail: normalizedDetail, tags: project.tags ?? [],
      summary: normalizedExcerpt, description: normalizedDetail,
      seo_title: dto.seo_title?.trim() || null, seo_description: dto.seo_description?.trim() || null, seo_image: dto.seo_image?.trim() || null,
      seo_no_index: dto.seo_no_index ?? translation.seo_no_index, is_published: dto.is_published ?? translation.is_published,
    });
    return this.portfolioTranslationRepo.save(translation);
  }

  async findPublicLanguages(slug: string) {
    const website = await this.websiteRepo.findOne({ where: { slug, is_active: true } });
    if (!website) throw new NotFoundException('Website not found');
    return this.languageRepo.find({ where: { website_id: website.id, is_active: true }, order: { sort_order: 'ASC', locale: 'ASC' } });
  }

  async findPublicPortfolioProjects(slug: string, locale?: string, acceptLanguage?: string) {
    const website = await this.websiteRepo.findOne({ where: { slug, is_active: true } });
    if (!website) throw new NotFoundException('Website not found');
    const localeOrder = await this.publicLocaleOrder(website.id, locale, acceptLanguage);
    const projects = await this.portfolioRepo.find({ where: { website_id: website.id, is_published: true }, order: { sort_order: 'ASC', created_at: 'ASC' } });
    const translations = await this.portfolioTranslationRepo.find({ where: { website_id: website.id } });
    const translationMap = new Map<string, WebsitePortfolioProjectTranslation>();
    for (const project of projects) {
      const translation = localeOrder
        .map((candidate) => translations.find((item) => item.project_id === project.id && item.locale === candidate && item.is_published))
        .find((item) => item !== undefined);
      if (translation) translationMap.set(project.id, translation);
    }

    return projects.flatMap((project) => {
      const translation = translationMap.get(project.id);
      if (!project.is_published || translation?.seo_no_index) return [];
      return [{ ...project, translation: translation ?? null }];
    });
  }

  async findPublicPortfolioProject(slug: string, projectSlug: string, locale?: string, acceptLanguage?: string) {
    const website = await this.websiteRepo.findOne({ where: { slug, is_active: true } });
    if (!website) throw new NotFoundException('Website not found');

    const localeOrder = await this.publicLocaleOrder(website.id, locale, acceptLanguage);
    const slugMatches = await this.portfolioTranslationRepo.find({ where: { website_id: website.id, slug: projectSlug } });
    const matchingTranslation = localeOrder
      .map((candidate) => slugMatches.find((item) => item.locale === candidate))
      .find((item) => item !== undefined)
      ?? slugMatches[0];
    const project = matchingTranslation
      ? await this.portfolioRepo.findOne({ where: { id: matchingTranslation.project_id, website_id: website.id, is_published: true } })
      : await this.portfolioRepo.findOne({ where: { website_id: website.id, slug: projectSlug, is_published: true } });
    if (!project) throw new NotFoundException('Portfolio project not found');

    const translations = await this.portfolioTranslationRepo.find({ where: { project_id: project.id, website_id: website.id } });
    const translation = localeOrder
      .map((candidate) => translations.find((item) => item.locale === candidate && item.is_published))
      .find((item) => item !== undefined);
    if (!translation) throw new NotFoundException('Portfolio project translation not found');
    return { ...project, translation };
  }

  async findPublicClients(slug: string, locale?: string, categorySlug?: string, acceptLanguage?: string) {
    const website = await this.websiteRepo.findOne({ where: { slug, is_active: true } });
    if (!website) throw new NotFoundException('Website not found');
    let clients = await this.partnerRepo.find({
      where: { website_id: website.id, is_client: true, is_public: true, is_active: true },
      order: { sort_order: 'ASC', created_at: 'ASC' },
    });
    if (categorySlug) {
      const category = await this.partnerCategoryRepo.findOne({
        where: { website_id: website.id, slug: categorySlug, is_public: true, is_active: true },
      });
      if (!category) return [];
      const assignments = await this.partnerCategoryAssignmentRepo.find({ where: { category_id: category.id } });
      const assigned = new Set(assignments.map((assignment) => assignment.partner_id));
      clients = clients.filter((client) => assigned.has(client.id));
    }
    if (!clients.length) return [];

    const localeOrder = await this.publicLocaleOrder(website.id, locale, acceptLanguage);
    const translations = await this.partnerTranslationRepo.find({
      where: { partner_id: In(clients.map((client) => client.id)) },
    });
    return clients.flatMap((client) => {
      const translation = localeOrder
        .map((candidate) => translations.find((item) => item.partner_id === client.id && item.locale === candidate))
        .find((item) => item !== undefined);
      return translation ? [{ ...client, translation }] : [];
    });
  }
}
