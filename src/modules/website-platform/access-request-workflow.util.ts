import type { WebsitePlatformAccessRequestStatus } from '../../entities/website-platform-access-request.entity';

const nextStatuses: Record<
  WebsitePlatformAccessRequestStatus,
  WebsitePlatformAccessRequestStatus[]
> = {
  pending: ['curating', 'rejected'],
  curating: ['invited', 'rejected'],
  invited: ['discussion', 'rejected'],
  discussion: ['approved', 'rejected'],
  approved: [],
  rejected: [],
};

export function canTransitionAccessRequest(
  current: WebsitePlatformAccessRequestStatus,
  next: WebsitePlatformAccessRequestStatus,
): boolean {
  return current === next || nextStatuses[current].includes(next);
}
