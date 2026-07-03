import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type { TenantStaff } from '../../entities';

export const CurrentStaff = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): TenantStaff => {
    const request = ctx.switchToHttp().getRequest<{ tenantStaff: TenantStaff }>();
    return request.tenantStaff;
  },
);
