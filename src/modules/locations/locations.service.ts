import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { WebsiteLocation } from '../../entities';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';

@Injectable()
export class LocationsService {
  constructor(
    @InjectRepository(WebsiteLocation)
    private readonly locationRepo: Repository<WebsiteLocation>,
  ) {}

  async findAll(websiteId: string, type?: string) {
    return this.locationRepo.find({
      where: {
        website_id: websiteId,
        ...(type ? { type } : {}),
      },
      order: { sort_order: 'ASC', name: 'ASC' },
    });
  }

  async findOne(locationId: string) {
    const location = await this.locationRepo.findOne({ where: { id: locationId } });
    if (!location) throw new NotFoundException('Location not found');
    return location;
  }

  async create(websiteId: string, dto: CreateLocationDto) {
    if (dto.is_primary) {
      await this.locationRepo.update({ website_id: websiteId, is_primary: true }, { is_primary: false });
    }

    const location = this.locationRepo.create({
      website_id: websiteId,
      name: dto.name,
      type: dto.type ?? 'branch',
      is_primary: dto.is_primary ?? false,
      is_public: dto.is_public ?? true,
      address_line: dto.address_line ?? null,
      city: dto.city ?? null,
      province: dto.province ?? null,
      postal_code: dto.postal_code ?? null,
      latitude: dto.latitude ?? null,
      longitude: dto.longitude ?? null,
      phone: dto.phone ?? null,
      whatsapp: dto.whatsapp ?? null,
      opening_hours: dto.opening_hours ?? {},
      maps_url: dto.maps_url ?? null,
      maps_embed: dto.maps_embed ?? null,
      metadata: dto.metadata ?? {},
      sort_order: dto.sort_order ?? 0,
      is_active: dto.is_active ?? true,
    });

    return this.locationRepo.save(location);
  }

  async update(locationId: string, websiteId: string, dto: UpdateLocationDto) {
    const location = await this.findOne(locationId);

    if (dto.is_primary) {
      await this.locationRepo.update({ website_id: websiteId, is_primary: true }, { is_primary: false });
    }

    Object.assign(location, dto);
    return this.locationRepo.save(location);
  }

  async setPrimary(locationId: string, websiteId: string) {
    await this.locationRepo.update({ website_id: websiteId, is_primary: true }, { is_primary: false });
    const location = await this.findOne(locationId);
    location.is_primary = true;
    return this.locationRepo.save(location);
  }

  async remove(locationId: string) {
    const location = await this.findOne(locationId);
    await this.locationRepo.remove(location);
    return { deleted: true };
  }
}
