import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { TenantStaff } from '../../entities';
import type { AuthUser } from './jwt.strategy';

/**
 * Guard yang memvalidasi bahwa user yang ter-autentikasi (via JwtAuthGuard)
 * memiliki akses ke website tertentu sebagai tenant staff.
 *
 * Website ID diambil dari:
 *   1. Route param `:websiteId`
 *   2. Header `x-website-id`
 *
 * Setelah validasi, `request.tenantStaff` berisi record TenantStaff
 * (termasuk role) yang bisa digunakan oleh RolesGuard selanjutnya.
 */
@Injectable()
export class TenantStaffGuard implements CanActivate {
  constructor(
    @InjectRepository(TenantStaff)
    private readonly staffRepo: Repository<TenantStaff>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user: AuthUser | undefined = request.user;

    if (!user?.userId) {
      throw new ForbiddenException('User authentication required before tenant access check');
    }

    const websiteId =
      request.params?.websiteId || request.headers['x-website-id'];

    if (!websiteId) {
      throw new BadRequestException(
        'Website ID is required (route param :websiteId or header x-website-id)',
      );
    }

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

    request.tenantStaff = staff;
    return true;
  }
}
