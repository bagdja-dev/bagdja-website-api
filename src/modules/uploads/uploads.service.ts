import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { TenantStaff } from '../../entities';
import type { AuthUser } from '../../common/auth';
import { SupabaseStorageService } from './supabase-storage.service';

@Injectable()
export class UploadsService {
  constructor(
    private readonly storage: SupabaseStorageService,
    @InjectRepository(TenantStaff)
    private readonly staffRepo: Repository<TenantStaff>,
  ) {}

  async uploadLogo(
    user: AuthUser,
    file: Express.Multer.File,
    websiteId?: string,
  ): Promise<{ url: string; path: string }> {
    if (websiteId) {
      const staff = await this.staffRepo.findOne({
        where: {
          website_id: websiteId,
          user_id: user.userId,
          is_active: true,
        },
      });
      if (!staff) {
        throw new ForbiddenException('You do not have access to this website');
      }
    }

    return this.storage.uploadLogo(file.buffer, file.mimetype, user.userId, websiteId);
  }

  async uploadAsset(
    user: AuthUser,
    file: Express.Multer.File,
    websiteId?: string,
    folder?: string,
  ): Promise<{ url: string; path: string }> {
    if (websiteId) {
      const staff = await this.staffRepo.findOne({
        where: {
          website_id: websiteId,
          user_id: user.userId,
          is_active: true,
        },
      });
      if (!staff) {
        throw new ForbiddenException('You do not have access to this website');
      }
    }

    return this.storage.uploadAsset(
      file.buffer,
      file.mimetype,
      user.userId,
      websiteId,
      folder ?? 'assets',
    );
  }
}
