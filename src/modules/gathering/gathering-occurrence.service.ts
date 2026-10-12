import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { GatheringOccurrence } from '../../entities/gathering-occurrence.entity';

@Injectable()
export class GatheringOccurrenceService {
  constructor(
    @InjectRepository(GatheringOccurrence)
    private readonly repo: Repository<GatheringOccurrence>,
  ) {}

  async create(dto: Partial<GatheringOccurrence>) {
    if (dto.min_attendees > dto.max_attendees) {
      throw new BadRequestException('min_attendees cannot exceed max_attendees');
    }

    if (dto.price_per_seat < 0) {
      throw new BadRequestException('price_per_seat cannot be negative');
    }

    if (dto.rsvp_open_at && dto.rsvp_close_at && dto.rsvp_close_at <= dto.rsvp_open_at) {
      throw new BadRequestException('rsvp_close_at must be after rsvp_open_at');
    }

    return this.repo.save(this.repo.create(dto));
  }

  async findOne(id: string) {
    const occurrence = await this.repo.findOne({ where: { id } });
    if (!occurrence) throw new NotFoundException('Gathering occurrence not found');
    return occurrence;
  }
}
