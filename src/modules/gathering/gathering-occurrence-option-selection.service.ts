import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { GatheringOccurrenceOptionSelection } from '../../entities/gathering-occurrence-option-selection.entity';

@Injectable()
export class GatheringOccurrenceOptionSelectionService {
  constructor(
    @InjectRepository(GatheringOccurrenceOptionSelection)
    private readonly repo: Repository<GatheringOccurrenceOptionSelection>,
  ) {}

  async setFinalSelection(dto: Partial<GatheringOccurrenceOptionSelection>) {
    if (!dto.occurrence_id || !dto.group_id || !dto.option_id || !dto.source || !dto.selected_by) {
      throw new BadRequestException('Missing final selection payload');
    }

    const existing = await this.repo.findOne({
      where: {
        occurrence_id: dto.occurrence_id,
        group_id: dto.group_id,
      },
    });

    if (existing) {
      return this.repo.update(existing.id, {
        option_id: dto.option_id,
        source: dto.source,
        selected_by: dto.selected_by,
        selected_at: new Date(),
      });
    }

    return this.repo.save(this.repo.create(dto));
  }

  async getFinalSelections(occurrenceId: string) {
    return this.repo.find({ where: { occurrence_id: occurrenceId } });
  }

  async findOne(id: string) {
    const selection = await this.repo.findOne({ where: { id } });
    if (!selection) throw new NotFoundException('Final selection not found');
    return selection;
  }
}
