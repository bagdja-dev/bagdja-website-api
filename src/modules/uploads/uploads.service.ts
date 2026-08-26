import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { TenantStaff } from '../../entities';
import type { AuthUser } from '../../common/auth';
import { StorageClientService } from '../storage/storage-client.service';

@Injectable()
export class UploadsService {
  constructor(
    private readonly storage: StorageClientService,
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

    return this.storage.uploadFile(file.buffer, file.mimetype, file.originalname, 'logo');
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

    return this.storage.uploadFile(
      file.buffer,
      file.mimetype,
      file.originalname,
      folder ?? 'assets',
    );
  }
}
