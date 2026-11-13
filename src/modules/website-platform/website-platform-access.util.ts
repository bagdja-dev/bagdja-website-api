import { createHash, randomBytes } from 'node:crypto';

import type { WebsitePlatformRole } from '../../entities/website-platform-member.entity';

export function normalizePlatformEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function createInvitationToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function isWebsitePlatformRole(
  role: unknown,
): role is WebsitePlatformRole {
  return role === 'designer' || role === 'reviewer';
}

export function isOrganizationOwnerOrAdmin(
  organizations: unknown,
  ownerOrganizationSlug: string,
): boolean {
  if (!Array.isArray(organizations) || !ownerOrganizationSlug) return false;

  return organizations.some((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    const organization = entry as {
      orgId?: unknown;
      isActive?: unknown;
      role?: { slug?: unknown } | null;
    };
    if (
      organization.orgId !== ownerOrganizationSlug ||
      organization.isActive !== true
    ) {
      return false;
    }

    return (
      organization.role?.slug === 'owner' ||
      organization.role?.slug === 'admin'
    );
  });
}

