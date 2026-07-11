import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { WebsiteProduct } from '../../entities';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(WebsiteProduct)
    private readonly productRepo: Repository<WebsiteProduct>,
  ) {}

  async findAll(websiteId: string, type?: string) {
    return this.productRepo.find({
      where: {
        website_id: websiteId,
        ...(type ? { type } : {}),
      },
      order: { sort_order: 'ASC', name: 'ASC' },
    });
  }

  async findOne(productId: string) {
    const product = await this.productRepo.findOne({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  private async assertSlugAvailable(websiteId: string, slug: string, excludeId?: string) {
    const existing = await this.productRepo.findOne({ where: { website_id: websiteId, slug } });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException(`Slug "${slug}" already exists in this website`);
    }
  }

  async create(websiteId: string, dto: CreateProductDto) {
    await this.assertSlugAvailable(websiteId, dto.slug);

    const product = this.productRepo.create({
      website_id: websiteId,
      type: dto.type ?? 'product',
      category: dto.category ?? null,
      name: dto.name,
      slug: dto.slug,
      description: dto.description ?? null,
      detail: dto.detail ?? null,
      price: dto.price ?? 0,
      images: dto.images ?? [],
      metadata: dto.metadata ?? {},
      sort_order: dto.sort_order ?? 0,
      is_active: dto.is_active ?? true,
    });
    return this.productRepo.save(product);
  }

  async update(productId: string, websiteId: string, dto: UpdateProductDto) {
    const product = await this.findOne(productId);

    if (dto.slug && dto.slug !== product.slug) {
      await this.assertSlugAvailable(websiteId, dto.slug, productId);
    }

    Object.assign(product, dto);
    return this.productRepo.save(product);
  }

  async remove(productId: string) {
    const product = await this.findOne(productId);
    await this.productRepo.remove(product);
    return { deleted: true };
  }
}
