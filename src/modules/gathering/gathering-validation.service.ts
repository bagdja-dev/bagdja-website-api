import { BadRequestException, Injectable } from '@nestjs/common';

import type { CreateGatheringOccurrenceDto } from './dto/create-gathering-occurrence.dto';
import type { CreateGatheringProductDto } from './dto/create-gathering-product.dto';

@Injectable()
export class GatheringValidationService {
  validateProduct(dto: CreateGatheringProductDto) {
    if (dto.min_attendees > dto.max_attendees) {
      throw new BadRequestException('min_attendees cannot exceed max_attendees');
    }

    if (dto.price_per_seat < 0) {
      throw new BadRequestException('price_per_seat cannot be negative');
    }
  }

  validateOccurrence(dto: CreateGatheringOccurrenceDto) {
    if (dto.min_attendees > dto.max_attendees) {
      throw new BadRequestException('min_attendees cannot exceed max_attendees');
    }

    if (dto.price_per_seat < 0) {
      throw new BadRequestException('price_per_seat cannot be negative');
    }

    if (dto.rsvp_open_at && dto.rsvp_close_at && dto.rsvp_close_at <= dto.rsvp_open_at) {
      throw new BadRequestException('rsvp_close_at must be after rsvp_open_at');
    }
  }
}
