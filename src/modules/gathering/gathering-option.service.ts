import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { GatheringOption } from '../../entities/gathering-option.entity';

@Injectable()
export class GatheringOptionService {
  constructor(
    @InjectRepository(GatheringOption)
    private readonly repo: Repository<GatheringOption>,
  ) {}

  async create(dto: Partial<GatheringOption>) {
    const exists = await this.repo.findOne({
      where: { group_id: dto.group_id, option_key: dto.option_key },
    });

    if (exists) {
      throw new BadRequestException('Option key already exists in this group');
    }

    return this.repo.save(this.repo.create(dto));
  }

  async findByGroup(groupId: string) {
    return this.repo.find({
      where: { group_id: groupId, is_active: true },
      order: { sort_order: 'ASC', label: 'ASC' },
    });
  }

  async findOne(id: string) {
    const option = await this.repo.findOne({ where: { id } });
    if (!option) throw new NotFoundException('Gathering option not found');
    return option;
  }
}
