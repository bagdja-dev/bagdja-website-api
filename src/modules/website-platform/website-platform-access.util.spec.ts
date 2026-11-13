import {
  createInvitationToken,
  hashInvitationToken,
  isOrganizationOwnerOrAdmin,
  isWebsitePlatformRole,
  normalizePlatformEmail,
} from './website-platform-access.util';

describe('Website Platform access helpers', () => {
  it('only accepts owner or admin membership in the owner organization', () => {
    expect(
      isOrganizationOwnerOrAdmin(
        [{ orgId: 'owner-org', isActive: true, role: { slug: 'owner' } }],
        'owner-org',
      ),
    ).toBe(true);
    expect(
      isOrganizationOwnerOrAdmin(
        [{ orgId: 'owner-org', isActive: true, role: { slug: 'admin' } }],
        'owner-org',
      ),
    ).toBe(true);
    expect(
      isOrganizationOwnerOrAdmin(
        [{ orgId: 'other-org', isActive: true, role: { slug: 'owner' } }],
        'owner-org',
      ),
    ).toBe(false);
    expect(
      isOrganizationOwnerOrAdmin(
        [{ orgId: 'owner-org', isActive: false, role: { slug: 'admin' } }],
        'owner-org',
      ),
    ).toBe(false);
    expect(
      isOrganizationOwnerOrAdmin(
        [{ orgId: 'owner-org', isActive: true, role: { slug: 'member' } }],
        'owner-org',
      ),
    ).toBe(false);
    expect(isOrganizationOwnerOrAdmin(null, 'owner-org')).toBe(false);
  });

  it('creates high-entropy invitation tokens and stores only their hash', () => {
    const token = createInvitationToken();
    expect(token).toHaveLength(43);
    expect(hashInvitationToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashInvitationToken(token)).not.toBe(token);
  });

  it('normalizes email and limits platform roles', () => {
    expect(normalizePlatformEmail('  Designer@Example.com ')).toBe(
      'designer@example.com',
    );
    expect(isWebsitePlatformRole('designer')).toBe(true);
    expect(isWebsitePlatformRole('reviewer')).toBe(true);
    expect(isWebsitePlatformRole('admin')).toBe(false);
  });
});
