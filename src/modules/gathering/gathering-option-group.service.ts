import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { GatheringOptionGroup } from '../../entities/gathering-option-group.entity';

@Injectable()
export class GatheringOptionGroupService {
  constructor(
    @InjectRepository(GatheringOptionGroup)
    private readonly repo: Repository<GatheringOptionGroup>,
  ) {}

  async create(dto: Partial<GatheringOptionGroup>) {
    const exists = await this.repo.findOne({
      where: { product_id: dto.product_id, group_key: dto.group_key },
    });

    if (exists) {
      throw new BadRequestException('Group key already exists for this product');
    }

    return this.repo.save(this.repo.create(dto));
  }

  async findByProduct(productId: string) {
    return this.repo.find({
      where: { product_id: productId, is_active: true },
      order: { sort_order: 'ASC', label: 'ASC' },
    });
  }

  async findOne(id: string) {
    const group = await this.repo.findOne({ where: { id } });
    if (!group) throw new NotFoundException('Gathering option group not found');
    return group;
  }
}
