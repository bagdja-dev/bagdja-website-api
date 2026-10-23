import { BadRequestException, NotFoundException } from '@nestjs/common';

import { GatheringOccurrence } from '../../entities/gathering-occurrence.entity';
import { GatheringOperation } from '../../entities/gathering-operation.entity';
import { WebsiteEventGroup } from '../../entities/website-event-group.entity';
import { WebsiteEventRegistration } from '../../entities/website-event-registration.entity';
import { Website } from '../../entities/website.entity';

import { GatheringAttendanceService } from './gathering-attendance.service';
import { parseTicketToken } from './gathering-links.util';

const TOKEN = 'tok_abcdefghijklmnopqrstuvwx';

function setup(overrides: { groupStatus?: string; finalSchedule?: Date | null; registration?: Record<string, unknown> } = {}) {
  const group: any = {
    id: 'group-1', website_id: 'site-1', initiator_user_id: 'user-1', title: 'Reuni 2010', plan_number: 'GTH-1',
    status: overrides.groupStatus ?? 'CONFIRMED', started_at: null,
  };
  const occurrence: any = {
    id: 'occurrence-1', parent_order_id: 'group-1', website_id: 'site-1', status: group.status,
    final_schedule: overrides.finalSchedule === undefined ? new Date(Date.now() + 60 * 60 * 1000) : overrides.finalSchedule,
    final_location: 'Bandung', option_groups_snapshot: [{ label: 'Aula', is_final_selection: true }],
  };
  const registration: any = {
    id: 'registration-1', group_id: 'group-1', occurrence_id: 'occurrence-1', website_id: 'site-1',
    attendee_name: 'Ayu', email: 'ayu@example.com', registration_status: 'RSVP_CONFIRMED', payment_status: 'PAID',
    attendance_token: TOKEN, ticket_email_sent_at: null, checked_in_at: null, check_in_method: null,
    created_at: new Date('2026-10-01'),
    ...overrides.registration,
  };
  const operations: any[] = [];
  const registrationRepo = {
    find: jest.fn(async ({ where }) => (where.attendance_token !== undefined && registration.attendance_token ? [] : [registration])),
    findOne: jest.fn(async ({ where }) => {
      if (where.attendance_token !== undefined) return where.attendance_token === registration.attendance_token && (!where.group_id || where.group_id === registration.group_id) ? registration : null;
      return where.id === registration.id ? registration : null;
    }),
    save: jest.fn(async (value) => value),
  };
  const repositories = new Map<any, any>([
    [WebsiteEventGroup, { findOne: jest.fn().mockResolvedValue(group), save: jest.fn(async (value) => value) }],
    [GatheringOccurrence, { findOne: jest.fn().mockResolvedValue(occurrence), save: jest.fn(async (value) => value) }],
    [WebsiteEventRegistration, registrationRepo],
    [Website, { findOne: jest.fn().mockResolvedValue({ id: 'site-1', name: 'Toko', slug: 'toko', domain: null }) }],
    [GatheringOperation, {
      create: jest.fn((value) => ({ id: 'operation-1', ...value })),
      save: jest.fn(async (value) => { operations.push({ ...value }); return value; }),
      findOne: jest.fn(async () => operations.at(-1)),
    }],
  ]);
  const manager = { getRepository: jest.fn((entity) => repositories.get(entity)) };
  const dataSource = {
    getRepository: jest.fn((entity) => repositories.get(entity)),
    transaction: jest.fn((callback) => callback(manager)),
  };
  const messaging = { gatheringAttendanceTicketTemplate: 'GatheringAttendanceTicket', sendEmail: jest.fn().mockResolvedValue(true) };
  const queue = { add: jest.fn().mockResolvedValue(undefined) };
  const service = new GatheringAttendanceService(dataSource as any, messaging as any, queue as any);
  return { service, group, occurrence, registration, messaging, queue, registrationRepo };
}

describe('GatheringAttendanceService', () => {
  it('starts a confirmed gathering within 24 hours of the schedule', async () => {
    const { service, group, occurrence } = setup();

    const result = await service.startGathering('group-1', 'site-1');

    expect(result.status).toBe('IN_PROGRESS');
    expect(group.started_at).toBeInstanceOf(Date);
    expect(occurrence.status).toBe('IN_PROGRESS');
  });

  it('refuses to start earlier than 24 hours before the schedule', async () => {
    const { service } = setup({ finalSchedule: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) });

    await expect(service.startGathering('group-1', 'site-1')).rejects.toThrow(BadRequestException);
  });

  it('issues a token for paid seats without one and queues ticket emails', async () => {
    const { service, registration, queue } = setup({ registration: { attendance_token: null } });

    const result = await service.issueTickets('group-1', 'site-1');

    expect(registration.attendance_token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(registration.ticket_issued_at).toBeInstanceOf(Date);
    expect(result).toEqual(expect.objectContaining({ status: 'QUEUED', total_count: 1 }));
    expect(queue.add).toHaveBeenCalledWith('issue-gathering-tickets', { operationId: 'operation-1' }, expect.any(Object));
  });

  it('sends the ticket email with the renderer ticket link and QR image', async () => {
    const { service, messaging, registration } = setup();
    await service.issueTickets('group-1', 'site-1');

    const operation = await service.processTicketIssuance('operation-1');

    expect(operation.status).toBe('COMPLETED');
    expect(messaging.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'ayu@example.com',
      template: 'GatheringAttendanceTicket',
      context: expect.objectContaining({
        'ticket-link': expect.stringContaining(`/gathering/ticket/${TOKEN}`),
        'ticket-qr-image': expect.stringContaining(`/api/public/gathering-tickets/${TOKEN}/qr`),
        'final-options': 'Aula',
      }),
    }));
    expect(registration.ticket_email_sent_at).toBeInstanceOf(Date);
  });

  it('checks in on the first scan and keeps the original check-in on a rescan', async () => {
    const { service, registration } = setup({ groupStatus: 'IN_PROGRESS' });

    const first = await service.checkIn('group-1', 'site-1', 'staff-1', { token: TOKEN });
    const firstTime = registration.checked_in_at;
    const second = await service.checkIn('group-1', 'site-1', 'staff-2', { token: TOKEN });

    expect(first.result).toBe('CHECKED_IN');
    expect(first.registration.check_in_method).toBe('SCAN');
    expect(second.result).toBe('ALREADY_CHECKED_IN');
    expect(registration.checked_in_at).toBe(firstTime);
    expect(registration.checked_in_by_user_id).toBe('staff-1');
  });

  it('checks in manually by registration id', async () => {
    const { service } = setup({ groupStatus: 'IN_PROGRESS' });

    const result = await service.checkIn('group-1', 'site-1', 'staff-1', { registrationId: 'registration-1' });

    expect(result.registration.check_in_method).toBe('MANUAL');
  });

  it('rejects check-in before the gathering starts, for unknown tickets, and for unpaid seats', async () => {
    await expect(setup().service.checkIn('group-1', 'site-1', 'staff-1', { token: TOKEN })).rejects.toThrow(BadRequestException);
    await expect(setup({ groupStatus: 'IN_PROGRESS' }).service.checkIn('group-1', 'site-1', 'staff-1', { token: 'tok_unknownunknownunknown' }))
      .rejects.toThrow(NotFoundException);
    await expect(setup({ groupStatus: 'IN_PROGRESS', registration: { payment_status: 'REFUNDED' } })
      .service.checkIn('group-1', 'site-1', 'staff-1', { token: TOKEN })).rejects.toThrow(BadRequestException);
  });

  it('exposes a public ticket without contact details', async () => {
    const { service } = setup();

    const ticket = await service.getPublicTicket(TOKEN);

    expect(ticket).toEqual(expect.objectContaining({ attendee_name: 'Ayu', ticket_status: 'VALID' }));
    expect(ticket).not.toHaveProperty('email');
    await expect(service.getPublicTicket('bad token!')).rejects.toThrow(NotFoundException);
  });
});

describe('parseTicketToken', () => {
  it('extracts the token from a ticket URL on any host or accepts a raw token', () => {
    expect(parseTicketToken(`https://toko.sites.bagdja.com/gathering/ticket/${TOKEN}`)).toBe(TOKEN);
    expect(parseTicketToken(`http://localhost:5005/toko/gathering/ticket/${TOKEN}?x=1`)).toBe(TOKEN);
    expect(parseTicketToken(`  ${TOKEN} `)).toBe(TOKEN);
  });
});
