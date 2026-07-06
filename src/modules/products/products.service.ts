import { Injectable, NotFoundException } from '@nestjs/common';
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

  async create(websiteId: string, dto: CreateProductDto) {
    const product = this.productRepo.create({
      website_id: websiteId,
      type: dto.type ?? 'product',
      name: dto.name,
      description: dto.description ?? null,
      price: dto.price ?? 0,
      images: dto.images ?? [],
      metadata: dto.metadata ?? {},
      sort_order: dto.sort_order ?? 0,
      is_active: dto.is_active ?? true,
    });
    return this.productRepo.save(product);
  }

  async update(productId: string, dto: UpdateProductDto) {
    const product = await this.findOne(productId);
    Object.assign(product, dto);
    return this.productRepo.save(product);
  }

  async remove(productId: string) {
    const product = await this.findOne(productId);
    await this.productRepo.remove(product);
    return { deleted: true };
  }
}
