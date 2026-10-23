import { BadRequestException } from '@nestjs/common';

import { GatheringOccurrence } from '../../entities/gathering-occurrence.entity';
import { User } from '../../entities/user.entity';
import { WebsiteEventGroup } from '../../entities/website-event-group.entity';
import { WebsiteEventInvitation } from '../../entities/website-event-invitation.entity';
import { WebsiteEventRegistration } from '../../entities/website-event-registration.entity';
import { Website } from '../../entities/website.entity';

import { GatheringMyInvitationsService } from './gathering-my-invitations.service';

const user = { userId: 'user-1', email: 'Ayu@Example.com' } as any;

function group(id: string, status: string, invitePolicy = 'OPEN') {
  return { id, website_id: 'site-1', title: `Acara ${id}`, plan_number: `GTH-${id}`, status, invite_policy: invitePolicy, initiator_user_id: 'host-1' };
}

function occurrence(groupId: string, finalSchedule: Date | null) {
  return { id: `occ-${groupId}`, parent_order_id: groupId, website_id: 'site-1', final_schedule: finalSchedule, final_location: 'Bandung' };
}

function registration(id: string, groupId: string, overrides: Record<string, unknown> = {}) {
  return {
    id, group_id: groupId, website_id: 'site-1', invitation_id: `inv-${id}`, email: 'ayu@example.com', attendee_name: 'Ayu',
    registration_status: 'RSVP_CONFIRMED', payment_status: 'UNPAID', invoice_issued_at: null, attendance_token: null,
    checked_in_at: null, payer_user_id: null, buyer_user_id: null,
    ...overrides,
  };
}

function setup(data: { groups: any[]; occurrences: any[]; registrations: any[]; invitations?: any[] }) {
  const repositories = new Map<any, any>([
    [WebsiteEventRegistration, {
      find: jest.fn().mockResolvedValue(data.registrations),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      findOne: jest.fn(),
    }],
    [WebsiteEventInvitation, { find: jest.fn().mockResolvedValue(data.invitations ?? []) }],
    [WebsiteEventGroup, { find: jest.fn().mockResolvedValue(data.groups) }],
    [GatheringOccurrence, { find: jest.fn().mockResolvedValue(data.occurrences) }],
    [User, { find: jest.fn().mockResolvedValue([{ id: 'host-1', name: 'Budi', username: 'budi' }]) }],
    [Website, { findOne: jest.fn().mockResolvedValue({ id: 'site-1', slug: 'toko', domain: null }) }],
  ]);
  const dataSource = { getRepository: jest.fn((entity) => repositories.get(entity)) };
  return { service: new GatheringMyInvitationsService(dataSource as any), repositories };
}

describe('GatheringMyInvitationsService', () => {
  it('orders by event date ascending with undated gatherings last', async () => {
    const { service } = setup({
      groups: [group('a', 'PAYMENT_OPEN'), group('b', 'CONFIRMED'), group('c', 'RSVP_OPEN')],
      occurrences: [occurrence('a', new Date('2026-12-01')), occurrence('b', new Date('2026-11-01')), occurrence('c', null)],
      registrations: [registration('r-a', 'a'), registration('r-b', 'b'), registration('r-c', 'c')],
    });

    const items = await service.listMyInvitations(user, 'site-1');

    expect(items.map((item) => item.group_id)).toEqual(['b', 'a', 'c']);
    expect(items[0].initiator_name).toBe('Budi');
  });

  it('includes pending INVITE_ONLY invitations with an RSVP action, skipping OPEN ones and answered ones', async () => {
    const { service } = setup({
      groups: [group('x', 'RSVP_OPEN', 'INVITE_ONLY'), group('y', 'RSVP_OPEN', 'OPEN'), group('z', 'RSVP_OPEN', 'INVITE_ONLY')],
      occurrences: [occurrence('x', null), occurrence('y', null), occurrence('z', null)],
      registrations: [registration('r-z', 'z', { invitation_id: 'inv-z' })],
      invitations: [
        { id: 'inv-x', group_id: 'x', invitee_name: 'Ayu' },
        { id: 'inv-y', group_id: 'y', invitee_name: 'Ayu' },
        { id: 'inv-z', group_id: 'z', invitee_name: 'Ayu' },
      ],
    });

    const items = await service.listMyInvitations(user, 'site-1');
    const invitations = items.filter((item) => item.kind === 'INVITATION');

    expect(invitations).toHaveLength(1);
    expect(invitations[0]).toEqual(expect.objectContaining({ id: 'inv-x', action: 'RSVP', action_path: '/gathering/invite/id/inv-x' }));
  });

  it('links every seat to its reservation detail without exposing ticket tokens in the list', async () => {
    const { service } = setup({
      groups: [group('g', 'CONFIRMED')],
      occurrences: [occurrence('g', new Date('2026-11-01'))],
      registrations: [
        registration('mine', 'g', { payment_status: 'PAID', invoice_issued_at: new Date(), attendance_token: 'tok_mine_aaaaaaaaaaaaaaaa' }),
        registration('friend', 'g', { email: 'friend@example.com', payer_user_id: 'user-1', payment_status: 'PAID', invoice_issued_at: new Date() }),
      ],
    });

    const items = await service.listMyInvitations(user, 'site-1');

    expect(items.find((item) => item.id === 'mine')).toEqual(expect.objectContaining({ action: 'TICKET', action_path: '/gathering/reservation/mine' }));
    expect(items.find((item) => item.id === 'friend')).toEqual(expect.objectContaining({ action: 'NONE', is_attendee: false }));
    expect(JSON.stringify(items)).not.toContain('tok_mine');
  });

  it('shows the QR ticket in the reservation detail only to the seat owner and issues a missing token', async () => {
    const mine = registration('mine', 'g', { payment_status: 'PAID', invoice_issued_at: new Date(), occurrence_id: 'occ-g' });
    const { service, repositories } = setup({ groups: [], occurrences: [], registrations: [] });
    const registrationRepo = repositories.get(WebsiteEventRegistration);
    registrationRepo.findOne.mockResolvedValue(mine);
    repositories.get(WebsiteEventGroup).findOne = jest.fn().mockResolvedValue(group('g', 'CONFIRMED'));
    repositories.get(GatheringOccurrence).findOne = jest.fn().mockResolvedValue(occurrence('g', new Date('2026-11-01')));

    const detail = await service.getReservation(user, 'mine', 'site-1');

    expect(detail.ticket?.url).toMatch(/\/gathering\/ticket\/[A-Za-z0-9_-]{32}$/);
    expect(detail.ticket?.status).toBe('VALID');
    expect(registrationRepo.update).toHaveBeenCalledWith(expect.objectContaining({ id: 'mine' }), expect.objectContaining({ attendance_token: expect.any(String) }));

    registrationRepo.findOne.mockResolvedValue({ ...mine, email: 'friend@example.com', payer_user_id: 'user-1', attendance_token: 'tok_friend_aaaaaaaaaaaaaa' });
    const payerView = await service.getReservation(user, 'mine', 'site-1');
    expect(payerView.ticket).toBeNull();
  });

  it('hides the ticket while the gathering is not yet confirmed and rejects strangers', async () => {
    const paid = registration('paid', 'g', { payment_status: 'PAID', invoice_issued_at: new Date(), occurrence_id: 'occ-g' });
    const { service, repositories } = setup({ groups: [], occurrences: [], registrations: [] });
    repositories.get(WebsiteEventRegistration).findOne.mockResolvedValue(paid);
    repositories.get(WebsiteEventGroup).findOne = jest.fn().mockResolvedValue(group('g', 'PAYMENT_OPEN'));
    repositories.get(GatheringOccurrence).findOne = jest.fn().mockResolvedValue(occurrence('g', null));

    const detail = await service.getReservation(user, 'paid', 'site-1');
    expect(detail.action).toBe('WAITING_CONFIRMATION');
    expect(detail.ticket).toBeNull();
    expect(repositories.get(WebsiteEventRegistration).update).not.toHaveBeenCalled();

    repositories.get(WebsiteEventRegistration).findOne.mockResolvedValue({ ...paid, email: 'other@example.com' });
    await expect(service.getReservation(user, 'paid', 'site-1')).rejects.toThrow('Reservation not found');
  });

  it('maps payment states to the next action', async () => {
    const { service } = setup({
      groups: [group('p', 'PAYMENT_OPEN'), group('w', 'RSVP_OPEN'), group('d', 'IN_PROGRESS')],
      occurrences: [occurrence('p', null), occurrence('w', null), occurrence('d', new Date())],
      registrations: [
        registration('pay', 'p', { invoice_issued_at: new Date() }),
        registration('wait', 'w'),
        registration('done', 'd', { payment_status: 'PAID', invoice_issued_at: new Date(), attendance_token: 'tok_done_aaaaaaaaaaaaaaaa', checked_in_at: new Date() }),
      ],
    });

    const items = await service.listMyInvitations(user, 'site-1');
    const actionOf = (id: string) => items.find((item) => item.id === id)?.action;

    expect(actionOf('pay')).toBe('PAY');
    expect(actionOf('wait')).toBe('WAITING_INVOICE');
    expect(actionOf('done')).toBe('ATTENDED');
  });

  it('requires a website scope', async () => {
    const { service } = setup({ groups: [], occurrences: [], registrations: [] });
    await expect(service.listMyInvitations(user, '')).rejects.toThrow(BadRequestException);
  });
});
