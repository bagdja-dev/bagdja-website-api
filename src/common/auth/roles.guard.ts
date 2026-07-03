import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ROLES_KEY, TenantRole } from './roles.decorator';

const ROLE_HIERARCHY: Record<TenantRole, number> = {
  viewer: 0,
  editor: 1,
  admin: 2,
  owner: 3,
};

/**
 * Cek apakah user punya role yang cukup untuk endpoint ini.
 * Harus digunakan **setelah** TenantStaffGuard yang meng-attach
 * `request.tenantStaff` ke request.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<TenantRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const staffRole: TenantRole | undefined = request.tenantStaff?.role;

    if (!staffRole) {
      throw new ForbiddenException('No tenant staff role found on request');
    }

    const userLevel = ROLE_HIERARCHY[staffRole] ?? -1;
    const allowed = requiredRoles.some((role) => userLevel >= ROLE_HIERARCHY[role]);

    if (!allowed) {
      throw new ForbiddenException(
        `Role '${staffRole}' is insufficient. Required: ${requiredRoles.join(' or ')}`,
      );
    }

    return true;
  }
}
