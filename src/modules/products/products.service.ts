import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { WebsiteProduct, type PaymentMetaEntry } from '../../entities';

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

  /**
   * Batasi hierarki varian maksimal 1 level (parent → children, tidak boleh
   * ada cucu). Dicek dari sisi target: target harus produk top-level
   * (`parent_product_id IS NULL`) dan berada di website yang sama.
   */
  private async assertValidParent(websiteId: string, parentProductId: string, excludeId?: string) {
    if (parentProductId === excludeId) {
      throw new BadRequestException('Produk tidak bisa dijadikan varian dari dirinya sendiri');
    }

    const parent = await this.productRepo.findOne({ where: { id: parentProductId } });
    if (!parent) throw new NotFoundException('Produk induk tidak ditemukan');
    if (parent.website_id !== websiteId) {
      throw new BadRequestException('Produk induk harus berada di website yang sama');
    }
    if (parent.parent_product_id !== null) {
      throw new BadRequestException(
        'Produk ini sudah menjadi varian dari produk lain — pilih produk top-level sebagai induk',
      );
    }
  }

  /**
   * Sisi sebaliknya dari `assertValidParent`: produk yang SUDAH punya
   * varian sendiri tidak boleh diubah jadi varian dari produk lain (akan
   * membuat hierarki 2 level / cucu).
   */
  private async assertNoExistingChildren(productId: string) {
    const childCount = await this.productRepo.count({ where: { parent_product_id: productId } });
    if (childCount > 0) {
      throw new BadRequestException(
        'Produk ini sudah punya varian sendiri — tidak bisa dijadikan varian dari produk lain',
      );
    }
  }

  async create(websiteId: string, dto: CreateProductDto) {
    await this.assertSlugAvailable(websiteId, dto.slug);
    if (dto.parent_product_id) {
      await this.assertValidParent(websiteId, dto.parent_product_id);
    }

    const product = this.productRepo.create({
      website_id: websiteId,
      type: dto.type ?? 'product',
      category_id: dto.category_id ?? null,
      parent_product_id: dto.parent_product_id ?? null,
      name: dto.name,
      slug: dto.slug,
      description: dto.description ?? null,
      detail: dto.detail ?? null,
      price: dto.price ?? 0,
      images: dto.images ?? [],
      metadata: dto.metadata ?? {},
      payment_meta: (dto.payment_meta ?? []) as PaymentMetaEntry[],
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

    if (dto.parent_product_id && dto.parent_product_id !== product.parent_product_id) {
      await this.assertValidParent(websiteId, dto.parent_product_id, productId);
      await this.assertNoExistingChildren(productId);
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
