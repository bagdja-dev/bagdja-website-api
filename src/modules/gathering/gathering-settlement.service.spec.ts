import { BadRequestException } from '@nestjs/common';

import { GatheringOccurrence } from '../../entities/gathering-occurrence.entity';
import { WebsiteEventGroup } from '../../entities/website-event-group.entity';
import { WebsiteEventRegistration } from '../../entities/website-event-registration.entity';
import { WebsiteOrder } from '../../entities/website-order.entity';
import { WebsiteTransaction } from '../../entities/website-transaction.entity';

import { GatheringSettlementService } from './gathering-settlement.service';

function setup(overrides: { groupStatus?: string; finalSchedule?: Date | null; metadata?: Record<string, unknown> | null } = {}) {
  const group: any = { id: 'group-1', website_id: 'site-1', order_id: 'plan-order-1', status: overrides.groupStatus ?? 'CONFIRMED' };
  const occurrence: any = {
    id: 'occurrence-1', parent_order_id: 'group-1', website_id: 'site-1', status: group.status,
    deposit_amount_per_seat: '40000', price_per_seat: '150000',
    final_schedule: overrides.finalSchedule === undefined ? new Date('2026-10-01T10:00:00Z') : overrides.finalSchedule,
  };
  const registrations = [
    { id: 'registration-1', order_id: 'order-1' },
    { id: 'registration-2', order_id: 'order-2' },
    { id: 'registration-3', order_id: 'order-3' },
  ];
  const orders = [
    { id: 'order-1', transaction_id: 'transaction-1', total_amount: '150000' },
    { id: 'order-2', transaction_id: 'transaction-1', total_amount: '150000' },
    { id: 'order-3', transaction_id: 'transaction-2', total_amount: '150000' },
  ];
  const transactions: any[] = [
    { id: 'transaction-1', website_id: 'site-1', payment_mode: 'ESCROW', escrow_id: 'escrow-1', status: 'HELD', metadata: overrides.metadata ?? null },
    { id: 'transaction-2', website_id: 'site-1', payment_mode: 'ESCROW', escrow_id: 'escrow-2', status: 'HELD', metadata: null },
  ];
  const repositories = new Map<any, any>([
    [WebsiteEventGroup, { findOne: jest.fn().mockResolvedValue(group), save: jest.fn(async (value) => value) }],
    [GatheringOccurrence, { findOne: jest.fn().mockResolvedValue(occurrence), save: jest.fn(async (value) => value) }],
    [WebsiteEventRegistration, { find: jest.fn().mockResolvedValue(registrations) }],
    [WebsiteOrder, { find: jest.fn().mockResolvedValue(orders) }],
    [WebsiteTransaction, {
      find: jest.fn().mockResolvedValue(transactions),
      findOne: jest.fn(async ({ where }) => transactions.find((transaction) => transaction.id === where.id)),
      save: jest.fn(async (value) => value),
    }],
  ]);
  const manager = { getRepository: jest.fn((entity) => repositories.get(entity)) };
  const dataSource = {
    manager,
    getRepository: jest.fn((entity) => repositories.get(entity)),
    transaction: jest.fn((callback) => callback(manager)),
  };
  const escrowClient = { release: jest.fn().mockResolvedValue({ escrowStatus: 'HELD' }) };
  const service = new GatheringSettlementService(dataSource as any, escrowClient as any);
  return { service, group, occurrence, transactions, escrowClient };
}

describe('GatheringSettlementService', () => {
  it('releases only the per-seat deposit per transaction on the DEPOSIT stage', async () => {
    const { service, group, occurrence, transactions, escrowClient } = setup();

    const outcome = await service.releaseStage(group, occurrence, 'DEPOSIT');

    expect(escrowClient.release).toHaveBeenCalledWith('escrow-1', 80000, 'gathering:occurrence-1:transaction-1:deposit');
    expect(escrowClient.release).toHaveBeenCalledWith('escrow-2', 40000, 'gathering:occurrence-1:transaction-2:deposit');
    expect(outcome).toEqual(expect.objectContaining({ stage: 'DEPOSIT', released_total: 120000, failed_count: 0 }));
    expect((transactions[0].metadata.gathering_deposit.plans[0])).toEqual(expect.objectContaining({ group_id: 'group-1', released_amount: 80000 }));
  });

  it('releases only the remainder on the FINAL stage and skips transactions already at target', async () => {
    const { service, group, occurrence, escrowClient } = setup({
      groupStatus: 'COMPLETED',
      metadata: { gathering_deposit: { plans: [{ group_id: 'group-1', released_amount: 300000 }, { group_id: 'other-group', released_amount: 10 }] } },
    });

    const outcome = await service.releaseStage(group, occurrence, 'FINAL');

    expect(escrowClient.release).toHaveBeenCalledTimes(1);
    expect(escrowClient.release).toHaveBeenCalledWith('escrow-2', 150000, 'gathering:occurrence-1:transaction-2:final');
    expect(outcome.items.find((item) => item.transaction_id === 'transaction-1')?.status).toBe('NOTHING_TO_RELEASE');
  });

  it('keeps going when one escrow fails and reports it for retry', async () => {
    const { service, group, occurrence, escrowClient } = setup();
    escrowClient.release.mockRejectedValueOnce(new Error('Escrow must be HELD to release funds (current: DISPUTED)'));

    const outcome = await service.releaseStage(group, occurrence, 'DEPOSIT');

    expect(outcome.failed_count).toBe(1);
    expect(outcome.released_total).toBe(40000);
    expect(outcome.items[0]).toEqual(expect.objectContaining({ status: 'FAILED', error: expect.stringContaining('DISPUTED') }));
  });

  it('reports outstanding deposit in the settlement summary', async () => {
    const { service, group, occurrence } = setup({
      metadata: { gathering_deposit: { plans: [{ group_id: 'group-1', released_amount: 80000 }] } },
    });

    const summary = await service.getSettlement(group, occurrence);

    expect(summary).toEqual(expect.objectContaining({
      stage: 'DEPOSIT', seat_total: 450000, deposit_target_total: 120000, released_total: 80000, outstanding_total: 40000,
    }));
  });

  it('completes a gathering in progress and releases the remainder', async () => {
    const { service, group, occurrence, escrowClient } = setup({ groupStatus: 'IN_PROGRESS' });

    const result = await service.completeGathering('group-1', 'site-1');

    expect(group.status).toBe('COMPLETED');
    expect(group.completed_at).toBeInstanceOf(Date);
    expect(occurrence.status).toBe('COMPLETED');
    expect(result.release.stage).toBe('FINAL');
    expect(escrowClient.release).toHaveBeenCalledWith('escrow-1', 300000, 'gathering:occurrence-1:transaction-1:final');
  });

  it('refuses to complete a gathering that has not been started', async () => {
    const { service, escrowClient } = setup({ groupStatus: 'CONFIRMED' });

    await expect(service.completeGathering('group-1', 'site-1')).rejects.toThrow(BadRequestException);
    expect(escrowClient.release).not.toHaveBeenCalled();
  });

  it('refuses to retry a release before the gathering is confirmed', async () => {
    const { service } = setup({ groupStatus: 'PAYMENT_OPEN' });

    await expect(service.retryRelease('group-1', 'site-1')).rejects.toThrow(BadRequestException);
  });
});
