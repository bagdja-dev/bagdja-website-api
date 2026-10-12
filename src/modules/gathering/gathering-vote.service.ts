import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { GatheringVote } from '../../entities/gathering-vote.entity';

@Injectable()
export class GatheringVoteService {
  constructor(
    @InjectRepository(GatheringVote)
    private readonly repo: Repository<GatheringVote>,
  ) {}

  async submitVote(dto: Partial<GatheringVote>) {
    if (!dto.occurrence_id || !dto.group_id || !dto.option_id || !dto.voter_registration_id) {
      throw new BadRequestException('Missing vote payload');
    }

    const existing = await this.repo.findOne({
      where: {
        occurrence_id: dto.occurrence_id,
        group_id: dto.group_id,
        voter_registration_id: dto.voter_registration_id,
      },
    });

    if (existing) {
      return this.repo.update(existing.id, {
        option_id: dto.option_id,
        updated_at: new Date(),
      });
    }

    return this.repo.save(this.repo.create(dto));
  }

  async getVotesByOccurrence(occurrenceId: string) {
    return this.repo.find({ where: { occurrence_id: occurrenceId } });
  }
}
