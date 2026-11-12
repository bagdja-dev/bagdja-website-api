import { canTransitionAccessRequest } from './access-request-workflow.util';

describe('canTransitionAccessRequest', () => {
  it('allows only the next curation stage or rejection', () => {
    expect(canTransitionAccessRequest('pending', 'curating')).toBe(true);
    expect(canTransitionAccessRequest('pending', 'rejected')).toBe(true);
    expect(canTransitionAccessRequest('pending', 'approved')).toBe(false);
    expect(canTransitionAccessRequest('curating', 'discussion')).toBe(false);
  });

  it('requires the introduction and discussion stages before approval', () => {
    expect(canTransitionAccessRequest('curating', 'invited')).toBe(true);
    expect(canTransitionAccessRequest('invited', 'discussion')).toBe(true);
    expect(canTransitionAccessRequest('discussion', 'approved')).toBe(true);
    expect(canTransitionAccessRequest('invited', 'approved')).toBe(false);
  });

  it('does not allow reopening a final decision', () => {
    expect(canTransitionAccessRequest('approved', 'curating')).toBe(false);
    expect(canTransitionAccessRequest('rejected', 'pending')).toBe(false);
    expect(canTransitionAccessRequest('discussion', 'discussion')).toBe(true);
  });
});
