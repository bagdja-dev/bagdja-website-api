import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Hierarki role: owner > admin > editor > viewer.
 * Dekorator ini menetapkan **role minimum** yang dibutuhkan.
 * Contoh: @Roles('editor') mengizinkan editor, admin, dan owner.
 */
export type TenantRole = 'owner' | 'admin' | 'editor' | 'viewer';

export const Roles = (...roles: TenantRole[]) => SetMetadata(ROLES_KEY, roles);
