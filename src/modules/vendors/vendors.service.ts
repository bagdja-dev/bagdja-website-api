import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { WebsiteLocation, WebsiteVendor, WebsiteVendorLocation } from '../../entities';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';

@Injectable()
export class VendorsService {
  constructor(
    @InjectRepository(WebsiteVendor)
    private readonly vendorRepo: Repository<WebsiteVendor>,
    @InjectRepository(WebsiteVendorLocation)
    private readonly vendorLocationRepo: Repository<WebsiteVendorLocation>,
    @InjectRepository(WebsiteLocation)
    private readonly locationRepo: Repository<WebsiteLocation>,
  ) {}

  async findAll(websiteId: string) {
    return this.vendorRepo.find({
      where: { website_id: websiteId },
      order: { name: 'ASC' },
      relations: ['vendor_locations', 'vendor_locations.location'],
    });
  }

  async findOne(vendorId: string, websiteId: string) {
    const vendor = await this.vendorRepo.findOne({
      where: { id: vendorId, website_id: websiteId },
      relations: ['vendor_locations', 'vendor_locations.location'],
    });
    if (!vendor) throw new NotFoundException('Vendor not found');
    return vendor;
  }

  private async assertNameAvailable(websiteId: string, name: string, excludeId?: string) {
    const existing = await this.vendorRepo.findOne({
      where: { website_id: websiteId, name },
    });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException(`Vendor "${name}" already exists in this website`);
    }
  }

  private async assertLocationOwnership(websiteId: string, locationIds: string[] = []) {
    if (locationIds.length === 0) return;

    const locations = await this.locationRepo.find({
      where: { id: In(locationIds), website_id: websiteId },
    });

    if (locations.length !== new Set(locationIds).size) {
      throw new ConflictException('One or more selected locations do not belong to this website');
    }
  }

  async create(websiteId: string, dto: CreateVendorDto) {
    await this.assertNameAvailable(websiteId, dto.name);
    await this.assertLocationOwnership(websiteId, dto.location_ids ?? []);

    const vendor = this.vendorRepo.create({
      website_id: websiteId,
      name: dto.name.trim(),
      contact_whatsapp: dto.contact_whatsapp ?? null,
      notes: dto.notes ?? null,
      status: dto.status ?? 'active',
    });

    const savedVendor = await this.vendorRepo.save(vendor);

    if ((dto.location_ids ?? []).length > 0) {
      const rows = dto.location_ids.map((locationId) => ({
        vendor_id: savedVendor.id,
        location_id: locationId,
        metadata: {},
      }));

      await this.vendorLocationRepo.save(rows);
    }

    return this.findOne(savedVendor.id, websiteId);
  }

  async update(vendorId: string, websiteId: string, dto: UpdateVendorDto) {
    const vendor = await this.vendorRepo.findOne({ where: { id: vendorId } });
    if (!vendor) throw new NotFoundException('Vendor not found');
    if (vendor.website_id !== websiteId) {
      throw new ConflictException('Vendor does not belong to this website');
    }

    if (dto.name && dto.name.trim() !== vendor.name) {
      await this.assertNameAvailable(websiteId, dto.name.trim(), vendorId);
    }

    if (dto.location_ids !== undefined) {
      await this.assertLocationOwnership(websiteId, dto.location_ids);

      await this.vendorLocationRepo.delete({ vendor_id: vendorId });
      if (dto.location_ids.length > 0) {
        const rows = dto.location_ids.map((locationId) => ({
          vendor_id: vendorId,
          location_id: locationId,
          metadata: {},
        }));
        await this.vendorLocationRepo.save(rows);
      }
    }

    Object.assign(vendor, {
      name: dto.name?.trim() ?? vendor.name,
      contact_whatsapp: dto.contact_whatsapp ?? vendor.contact_whatsapp,
      notes: dto.notes ?? vendor.notes,
      status: dto.status ?? vendor.status,
    });

    await this.vendorRepo.save(vendor);
    return this.findOne(vendorId, websiteId);
  }

  async remove(vendorId: string, websiteId: string) {
    const vendor = await this.findOne(vendorId, websiteId);
    vendor.status = 'inactive';
    await this.vendorRepo.save(vendor);
    return { deleted: true, status: 'inactive' };
  }
}
