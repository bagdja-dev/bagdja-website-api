import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { WebsiteEventProductOption, WebsiteProduct } from '../../entities';
import { ReplaceGatheringOptionsDto } from './dto/replace-gathering-options.dto';
import {
  assertUniformGatheringOptionConfig,
  normalizeGatheringCancellationPolicy,
} from './gathering-product-options.validation';

@Injectable()
export class GatheringProductOptionsService {
  constructor(
    @InjectRepository(WebsiteProduct)
    private readonly productRepo: Repository<WebsiteProduct>,
    @InjectRepository(WebsiteEventProductOption)
    private readonly optionRepo: Repository<WebsiteEventProductOption>,
    private readonly dataSource: DataSource,
  ) {}

  async findForProduct(websiteId: string, productId: string) {
    await this.assertGatheringProduct(websiteId, productId);
    return this.optionRepo.find({
      where: { website_id: websiteId, product_id: productId },
      order: { option_group_key: 'ASC', sort_order: 'ASC', label: 'ASC' },
    });
  }

  async replaceForProduct(
    websiteId: string,
    productId: string,
    dto: ReplaceGatheringOptionsDto,
  ) {
    const product = await this.assertGatheringProduct(websiteId, productId);
    this.validateUniqueKeys(dto.options);
    const normalizedOptions = dto.options.map((option) => ({
      ...option,
      currency: (option.currency ?? 'IDR').toUpperCase(),
      deposit_amount_per_seat: Number(option.deposit_amount_per_seat ?? 0),
      cancellation_policy: normalizeGatheringCancellationPolicy(
        option.cancellation_policy,
        Number(option.price_per_seat),
      ),
    }));
    if (normalizedOptions.some((option) => Number(option.price_per_seat) !== Number(product.price))) {
      throw new BadRequestException('Gathering choice price must match the product per-seat price');
    }
    if (normalizedOptions.some((option) => option.deposit_amount_per_seat > Number(option.price_per_seat))) {
      throw new BadRequestException('Per-seat deposit cannot exceed the seat price');
    }
    assertUniformGatheringOptionConfig(normalizedOptions);

    return this.dataSource.transaction(async (manager) => {
      const options = manager.getRepository(WebsiteEventProductOption);
      const existing = await options.find({ where: { website_id: websiteId, product_id: productId } });
      const existingById = new Map(existing.map((option) => [option.id, option]));
      const existingByKey = new Map(
        existing.map((option) => [`${option.option_group_key}:${option.option_key}`, option]),
      );
      const retainedIds = new Set<string>();
      const saved: WebsiteEventProductOption[] = [];

      for (const input of normalizedOptions) {
        const key = `${input.option_group_key}:${input.option_key}`;
        const current = input.id ? existingById.get(input.id) : existingByKey.get(key);
        if (input.id && !current) {
          throw new BadRequestException('Gathering option does not belong to this product');
        }
        if (current) retainedIds.add(current.id);

        const option = options.create({
          ...current,
          website_id: websiteId,
          product_id: productId,
          option_group_key: input.option_group_key,
          option_key: input.option_key,
          label: input.label,
          description: input.description ?? null,
          price_per_seat: String(input.price_per_seat),
          deposit_amount_per_seat: String(input.deposit_amount_per_seat),
          currency: (input.currency ?? 'IDR').toUpperCase(),
          min_attendees: input.min_attendees,
          max_attendees: input.max_attendees,
          availability_window: input.availability_window ?? {},
          venue_location: input.venue_location ?? null,
          benefits: input.benefits ?? [],
          cancellation_policy: input.cancellation_policy ?? {},
          is_active: input.is_active ?? true,
          sort_order: input.sort_order ?? 0,
        });
        saved.push(await options.save(option));
      }

      const removed = existing.filter((option) => !retainedIds.has(option.id));
      if (removed.length) {
        await options.update(
          removed.map((option) => option.id),
          { is_active: false },
        );
      }

      return options.find({
        where: { website_id: websiteId, product_id: productId },
        order: { option_group_key: 'ASC', sort_order: 'ASC', label: 'ASC' },
      }).then((rows) => rows.length ? rows : saved);
    });
  }

  private async assertGatheringProduct(websiteId: string, productId: string) {
    const product = await this.productRepo.findOne({ where: { id: productId, website_id: websiteId } });
    if (!product) throw new NotFoundException('Product not found');
    if (product.type !== 'gathering') {
      throw new BadRequestException('Gathering options can only be configured for gathering products');
    }
    return product;
  }

  private validateUniqueKeys(options: ReplaceGatheringOptionsDto['options']) {
    const keys = new Set<string>();
    for (const option of options) {
      if (option.min_attendees > option.max_attendees) {
        throw new BadRequestException('min_attendees cannot exceed max_attendees');
      }
      const key = `${option.option_group_key}:${option.option_key}`;
      if (keys.has(key)) throw new BadRequestException('Option keys must be unique within each group');
      keys.add(key);
    }
  }
}