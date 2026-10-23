import { NotFoundException } from '@nestjs/common';

import { GatheringOccurrence } from '../../entities/gathering-occurrence.entity';
import { WebsiteEventGroup } from '../../entities/website-event-group.entity';
import { WebsiteEventRegistration } from '../../entities/website-event-registration.entity';

import { TenantGatheringCalendarController } from './tenant-gathering-calendar.controller';

describe('TenantGatheringCalendarController', () => {
  it('returns tenant-scoped gathering details, voting results, and attendee statuses', async () => {
    const group = {
      id: 'group-1', website_id: 'site-1', title: 'Gathering', status: 'PAYMENT_OPEN',
      workflow_step: 'PAYMENT_CONFIRMATION', invite_policy: 'OPEN',
    };
    const occurrence = {
      id: 'occurrence-1', parent_order_id: 'group-1', website_id: 'site-1', status: 'PAYMENT_OPEN',
      rsvp_open_at: null, rsvp_close_at: null, payment_deadline: null, final_schedule: '2026-11-01',
      final_location: 'Bandung', price_per_seat: '150000', deposit_amount_per_seat: '40000', currency: 'IDR',
      min_attendees: 5, max_attendees: 30, cancellation_policy_snapshot: {},
      option_groups_snapshot: [{ product_option_id: 'option-1', option_group_key: 'venue', label: 'Taman' }],
      opened_option_ids_snapshot: ['option-1'],
    };
    const registrations = [{
      id: 'registration-1', attendee_name: 'Ayu', selected_options: { venue: 'option-1' },
      registration_status: 'RSVP_CONFIRMED', payment_status: 'PAID', created_at: new Date('2026-10-14'),
    }];
    const groupRepo = { findOne: jest.fn().mockResolvedValue(group) };
    const occurrenceRepo = { findOne: jest.fn().mockResolvedValue(occurrence) };
    const registrationRepo = { find: jest.fn().mockResolvedValue(registrations) };
    const settlement = {
      stage: 'HOLD', seat_total: 150000, deposit_target_total: 40000, released_total: 0, outstanding_total: 0,
      transactions: [{ transaction_id: 'transaction-1', transaction_status: 'HELD', seat_count: 1, registration_ids: ['registration-1'], seat_total: 150000, deposit_target: 40000, released_amount: 0 }],
    };
    const settlementService = { getSettlement: jest.fn().mockResolvedValue(settlement) };
    const controller = new TenantGatheringCalendarController(groupRepo as any, occurrenceRepo as any, registrationRepo as any, settlementService as any, {} as any);

    const result = await controller.detail('site-1', 'group-1');

    expect(groupRepo.findOne).toHaveBeenCalledWith({ where: { id: 'group-1', website_id: 'site-1' } });
    expect(occurrenceRepo.findOne).toHaveBeenCalledWith({ where: { parent_order_id: 'group-1', website_id: 'site-1' } });
    expect(registrationRepo.find).toHaveBeenCalledWith(expect.objectContaining({
      where: { group_id: 'group-1', occurrence_id: 'occurrence-1', website_id: 'site-1' },
    }));
    expect(result.occurrence.voting_results.venue).toEqual({
      total_votes: 1,
      options: { 'option-1': { votes: 1, percentage: 100 } },
    });
    expect(result).toEqual(expect.objectContaining({ attendee_count: 1, paid_seat_count: 1 }));
    expect(result.registrations[0]).toEqual(expect.objectContaining({
      attendee_name: 'Ayu', payment_status: 'PAID', transaction_id: 'transaction-1', transaction_status: 'HELD',
    }));
    expect(result.settlement).toBe(settlement);
  });

  it('does not expose a gathering owned by another website', async () => {
    const groupRepo = { findOne: jest.fn().mockResolvedValue(null) };
    const occurrenceRepo = { findOne: jest.fn() };
    const registrationRepo = { find: jest.fn() };
    const controller = new TenantGatheringCalendarController(groupRepo as any, occurrenceRepo as any, registrationRepo as any, {} as any, {} as any);

    await expect(controller.detail('site-2', 'group-1')).rejects.toThrow(NotFoundException);
    expect(groupRepo.findOne).toHaveBeenCalledWith({ where: { id: 'group-1', website_id: 'site-2' } });
    expect(occurrenceRepo.findOne).not.toHaveBeenCalled();
    expect(registrationRepo.find).not.toHaveBeenCalled();
  });
});