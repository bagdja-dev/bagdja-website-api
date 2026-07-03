import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { TenantStaff, Website } from '../../entities';

@Injectable()
export class WebsitesService {
  constructor(
    @InjectRepository(TenantStaff)
    private readonly staffRepo: Repository<TenantStaff>,
    @InjectRepository(Website)
    private readonly websiteRepo: Repository<Website>,
  ) {}

  async findWebsitesByUserId(userId: string) {
    const staffRecords = await this.staffRepo.find({
      where: { user_id: userId, is_active: true },
      relations: ['website'],
      order: { created_at: 'DESC' },
    });

    return staffRecords.map((staff) => ({
      website: staff.website,
      role: staff.role,
      is_active: staff.is_active,
    }));
  }

  async findWebsiteById(websiteId: string) {
    return this.websiteRepo.findOne({ where: { id: websiteId } });
  }
}
