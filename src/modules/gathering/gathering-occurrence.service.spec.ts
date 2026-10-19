import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { In, Not } from 'typeorm';

import { GatheringOccurrence } from '../../entities/gathering-occurrence.entity';
import { WebsiteEventGroup } from '../../entities/website-event-group.entity';
import { WebsiteEventInvitation } from '../../entities/website-event-invitation.entity';
import { WebsiteEventProductOption } from '../../entities/website-event-product-option.entity';
import { WebsiteEventRegistration } from '../../entities/website-event-registration.entity';
import { WebsiteEventRsvpChallenge } from '../../entities/website-event-rsvp-challenge.entity';
import { WebsiteOrder } from '../../entities/website-order.entity';
import { WebsiteTransaction } from '../../entities/website-transaction.entity';
import { WebsiteProduct } from '../../entities/website-product.entity';
import { Website } from '../../entities/website.entity';
import { GatheringOperation } from '../../entities/gathering-operation.entity';

import { GatheringOccurrenceService } from './gathering-occurrence.service';

describe('GatheringOccurrenceService', () => {
  const product = {
    id: 'product-1',
    website_id: 'site-1',
    name: 'Paket Reuni',
    type: 'gathering',
    is_active: true,
    price: 150000,
    payment_meta: [{ payment_mode: 'ESCROW' }],
  };
  const initiator = { userId: 'user-1', email: 'initiator@example.com' } as any;
  const options = [{
    id: 'option-1',
    website_id: 'site-1',
    product_id: 'product-1',
    option_group_key: 'venue',
    option_key: 'garden',
    label: 'Taman',
    description: null,
    price_per_seat: '150000',
    deposit_amount_per_seat: '40000',
    currency: 'IDR',
    min_attendees: 5,
    max_attendees: 30,
    availability_window: {},
    venue_location: 'Bandung',
    benefits: [],
    cancellation_policy: {
      version: 1,
      prepare_days_before_event: 7,
      cutoff_days_before_event: 3,
      penalty_type: 'FIXED',
      penalty_value: 10000,
    },
  }];

  function buildService({ productFound = true, existingGroup = null as any } = {}) {
    const groups = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: 'group-1', ...value })),
      findOne: jest.fn(async ({ where }) => (
        existingGroup
        && existingGroup.id === where.id
        && existingGroup.website_id === where.website_id
        && existingGroup.initiator_user_id === where.initiator_user_id
          ? existingGroup
          : null
      )),
      find: jest.fn().mockResolvedValue([]),
    };
    const orders = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: 'order-1', ...value })),
    };
    const occurrences = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: 'occurrence-1', ...value })),
      findOne: jest.fn().mockResolvedValue({ id: 'occurrence-1', status: 'PREORDER' }),
      find: jest.fn().mockResolvedValue([]),
    };
    const invitations = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => Array.isArray(value)
        ? value
        : { ...value, id: value.id ?? 'invite-1' }),
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
    };
    const registrations = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn(async (value) => value),
    };
    const gatheringOperations = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ ...value, id: value.id ?? 'operation-1' })),
      findOne: jest.fn().mockResolvedValue(null),
    };
    const products = { findOne: jest.fn().mockResolvedValue(productFound ? product : null) };
    const productOptions = { find: jest.fn().mockResolvedValue(options) };
    const repositoryMap = new Map<any, any>([
      [WebsiteProduct, products],
      [WebsiteEventRegistration, registrations],
      [WebsiteEventInvitation, invitations],
      [WebsiteEventProductOption, productOptions],
      [WebsiteEventGroup, groups],
      [GatheringOccurrence, occurrences],
      [WebsiteOrder, orders],
      [GatheringOperation, gatheringOperations],
    ]);
    const manager = { getRepository: jest.fn((entity) => repositoryMap.get(entity)) };
    const dataSource = {
      transaction: jest.fn((callback) => callback(manager)),
      getRepository: jest.fn((entity) => repositoryMap.get(entity)),
    };
    return { service: new GatheringOccurrenceService(dataSource as any), dataSource, groups, occurrences, products, orders, invitations, registrations, gatheringOperations };
  }

  it('creates an unscheduled PREORDER parent and occurrence with product snapshots', async () => {
    const { service, groups, occurrences } = buildService();

    const result = await service.createPlan(initiator, {
      website_id: 'site-1',
      product_id: 'product-1',
    });

    expect(groups.save).toHaveBeenCalledWith(expect.objectContaining({
      website_id: 'site-1',
      product_id: 'product-1',
      initiator_user_id: 'user-1',
      status: 'PREORDER',
    }));
    expect(occurrences.save).toHaveBeenCalledWith(expect.objectContaining({
      website_id: 'site-1',
      parent_order_id: 'group-1',
      initiator_user_id: 'user-1',
      status: 'PREORDER',
      price_per_seat: 150000,
      deposit_amount_per_seat: 40000,
      min_attendees: 5,
      max_attendees: 30,
      option_groups_snapshot: [expect.objectContaining({
        product_option_id: 'option-1',
        option_group_key: 'venue',
        option_key: 'garden',
      })],
      cancellation_policy_snapshot: options[0].cancellation_policy,
    }));
    const occurrenceInput = occurrences.create.mock.calls[0][0];
    expect(occurrenceInput.final_schedule).toBeUndefined();
    expect(occurrenceInput.final_location).toBeUndefined();
    expect(result.occurrence.id).toBe('occurrence-1');
  });

  it('puts the plan in the initiator cart as a seatless, never-checkout plan order', async () => {
    const { service, groups, orders } = buildService();

    const result = await service.createPlan(initiator, {
      website_id: 'site-1',
      product_id: 'product-1',
    });

    expect(orders.save).toHaveBeenCalledWith(expect.objectContaining({
      website_id: 'site-1',
      product_id: 'product-1',
      buyer_user_id: 'user-1',
      buyer_identifier: 'initiator@example.com',
      quantity: 0,
      total_amount: 0,
      unit_price: 150000,
      payment_mode: 'ESCROW',
      status: 'PENDING',
      parent_order_id: null,
      metadata: {
        source: 'gathering_plan',
        gathering: { role: 'initiator', group_id: 'group-1', occurrence_id: 'occurrence-1' },
      },
    }));
    expect(groups.save).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'group-1', order_id: 'order-1' }));
    expect(result.order_id).toBe('order-1');
  });

  it('rejects a product outside the requested website before creating a parent', async () => {
    const { service, groups, occurrences, orders } = buildService({ productFound: false });

    await expect(service.createPlan(initiator, {
      website_id: 'site-2',
      product_id: 'product-1',
    })).rejects.toThrow(NotFoundException);

    expect(groups.save).not.toHaveBeenCalled();
    expect(occurrences.save).not.toHaveBeenCalled();
    expect(orders.save).not.toHaveBeenCalled();
  });

  it('hides the plan when website or initiator ownership does not match', async () => {
    const { service, dataSource } = buildService();
    const groupRepo = dataSource.getRepository(WebsiteEventGroup) as any;

    await expect(service.findPlanForInitiator('group-1', 'site-2', 'user-1'))
      .rejects.toThrow(NotFoundException);
    await expect(service.findPlanForInitiator('group-1', 'site-1', 'user-2'))
      .rejects.toThrow(NotFoundException);
    expect(groupRepo.findOne).toHaveBeenNthCalledWith(1, {
      where: { id: 'group-1', website_id: 'site-2', initiator_user_id: 'user-1' },
    });
    expect(groupRepo.findOne).toHaveBeenNthCalledWith(2, {
      where: { id: 'group-1', website_id: 'site-1', initiator_user_id: 'user-2' },
    });
  });

  it('lists all plan statuses scoped to the current website and initiator for calendar filters', async () => {
    const groups = [{ id: 'group-1', website_id: 'site-1', initiator_user_id: 'user-1', status: 'PREORDER' }];
    const occurrences = [{ id: 'occurrence-1', parent_order_id: 'group-1', website_id: 'site-1', initiator_user_id: 'user-1' }];
    const { service, dataSource } = buildService();
    const groupRepo = dataSource.getRepository(WebsiteEventGroup) as any;
    const occurrenceRepo = dataSource.getRepository(GatheringOccurrence) as any;
    groupRepo.find.mockResolvedValue(groups);
    occurrenceRepo.find.mockResolvedValue(occurrences);

    const result = await service.listPlansForInitiator('site-1', 'user-1');

    expect(groupRepo.find).toHaveBeenCalledWith({
      where: { website_id: 'site-1', initiator_user_id: 'user-1' },
      order: { created_at: 'DESC' },
    });
    expect(occurrenceRepo.find).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ website_id: 'site-1', initiator_user_id: 'user-1' }),
    }));
    expect(result).toEqual([{ ...groups[0], occurrence: occurrences[0] }]);
  });

  it('cancels an active gathering and marks registrations as cancelled', async () => {
    const group = {
      id: 'group-1',
      website_id: 'site-1',
      initiator_user_id: 'user-1',
      status: 'PAYMENT_OPEN',
      workflow_step: 'PAYMENT_CONFIRMATION',
      order_id: 'plan-order-1',
      title: 'Gathering test',
    };
    const occurrence = {
      id: 'occurrence-1',
      parent_order_id: 'group-1',
      website_id: 'site-1',
      status: 'PAYMENT_OPEN',
      title: 'Gathering test',
    };
    const registrations = [
      { id: 'reg-1', group_id: 'group-1', website_id: 'site-1', registration_status: 'RSVP_CONFIRMED', payment_status: 'UNPAID', attendee_name: 'A', email: 'a@example.com', invitation_id: 'inv-1', order_id: 'seat-order-1' },
      { id: 'reg-2', group_id: 'group-1', website_id: 'site-1', registration_status: 'RSVP_CONFIRMED', payment_status: 'PENDING_PAYMENT', attendee_name: 'B', email: 'b@example.com', invitation_id: 'inv-1', order_id: 'seat-order-2' },
    ];
    const orders = [
      { id: 'plan-order-1', status: 'PENDING', transaction_id: null, metadata: {} },
      { id: 'seat-order-1', status: 'PENDING', transaction_id: null, metadata: {} },
      { id: 'seat-order-2', status: 'PENDING', transaction_id: null, metadata: {} },
    ];
    const groupsRepo = { findOne: jest.fn().mockResolvedValue(group), save: jest.fn(async (value) => value) };
    const occurrencesRepo = { findOne: jest.fn().mockResolvedValue(occurrence), save: jest.fn(async (value) => value) };
    const registrationsRepo = { find: jest.fn().mockResolvedValue(registrations), save: jest.fn(async (value) => value) };
    const invitationsRepo = { find: jest.fn().mockResolvedValue([]), save: jest.fn(async (value) => value) };
    const ordersRepo = { find: jest.fn().mockResolvedValue(orders), save: jest.fn(async (value) => value) };
    const repoMap = new Map<any, any>([
      [WebsiteEventGroup, groupsRepo],
      [GatheringOccurrence, occurrencesRepo],
      [WebsiteEventRegistration, registrationsRepo],
      [WebsiteOrder, ordersRepo],
      [WebsiteEventInvitation, invitationsRepo],
    ]);
    const dataSource = {
      getRepository: jest.fn((entity) => repoMap.get(entity) ?? ({ findOne: jest.fn().mockResolvedValue(null), save: jest.fn(async (value) => value) })),
      transaction: jest.fn((callback) => callback({ getRepository: jest.fn((entity) => repoMap.get(entity)) })),
    };
    const service = new GatheringOccurrenceService(dataSource as any);

    const result = await service.cancelGathering('group-1', 'site-1', 'user-1', 'Test cancel');

    expect(result.status).toBe('CANCELLED');
    expect(group.status).toBe('CANCELLED');
    expect(occurrence.status).toBe('CANCELLED');
    expect(registrations.every((registration) => registration.registration_status === 'CANCELLED')).toBe(true);
    expect(orders.every((order) => order.status === 'CANCELLED')).toBe(true);
    expect(orders[0].metadata).toEqual(expect.objectContaining({ cancellation_reason: 'Test cancel' }));
    expect(groupsRepo.save).toHaveBeenCalled();
  });

  it('refunds held participant escrow when the initiator cancels a confirmed gathering', async () => {
    const group = {
      id: 'group-1', website_id: 'site-1', initiator_user_id: 'user-1',
      status: 'CONFIRMED', workflow_step: 'LOCKED', order_id: 'plan-order-1',
    };
    const occurrence = { id: 'occurrence-1', parent_order_id: 'group-1', website_id: 'site-1', status: 'CONFIRMED' };
    const registration = {
      id: 'registration-1', group_id: 'group-1', website_id: 'site-1', order_id: 'seat-order-1',
      registration_status: 'RSVP_CONFIRMED', payment_status: 'PAID', invitation_id: 'invite-1',
    };
    const order = {
      id: 'seat-order-1', website_id: 'site-1', parent_order_id: 'plan-order-1',
      transaction_id: 'transaction-1', status: 'HELD', metadata: {},
    };
    const transaction = {
      id: 'transaction-1', website_id: 'site-1', payment_mode: 'ESCROW', escrow_id: 'escrow-1', status: 'HELD',
    };
    const groupsRepo = { findOne: jest.fn().mockResolvedValue(group), save: jest.fn(async (value) => value) };
    const occurrencesRepo = { findOne: jest.fn().mockResolvedValue(occurrence), save: jest.fn(async (value) => value) };
    const registrationsRepo = { find: jest.fn().mockResolvedValue([registration]), save: jest.fn(async (value) => value) };
    const invitationsRepo = { find: jest.fn().mockResolvedValue([]), save: jest.fn(async (value) => value) };
    const ordersRepo = { find: jest.fn().mockResolvedValue([order]), save: jest.fn(async (value) => value) };
    const transactionsRepo = { find: jest.fn().mockResolvedValue([transaction]), save: jest.fn(async (value) => value) };
    const repoMap = new Map<any, any>([
      [WebsiteEventGroup, groupsRepo],
      [GatheringOccurrence, occurrencesRepo],
      [WebsiteEventRegistration, registrationsRepo],
      [WebsiteEventInvitation, invitationsRepo],
      [WebsiteOrder, ordersRepo],
      [WebsiteTransaction, transactionsRepo],
    ]);
    const manager = { getRepository: jest.fn((entity) => repoMap.get(entity)) };
    const escrowClient = {
      getEscrow: jest.fn().mockResolvedValue({ id: 'escrow-1', status: 'HELD', remaining_hold: 125000 }),
      refund: jest.fn().mockResolvedValue({ status: 'REFUNDED' }),
    };
    const dataSource = {
      getRepository: jest.fn((entity) => repoMap.get(entity)),
      transaction: jest.fn((callback) => callback(manager)),
    };
    const service = new GatheringOccurrenceService(dataSource as any, undefined, escrowClient as any);

    const result = await service.cancelGathering('group-1', 'site-1', 'user-1', 'Perubahan jadwal');

    expect(escrowClient.refund).toHaveBeenCalledWith(
      'escrow-1',
      'gathering-initiator-cancel:occurrence-1:transaction-1',
      undefined,
      'Gathering cancelled by initiator: Perubahan jadwal',
    );
    expect(transaction.status).toBe('REFUNDED');
    expect(group.status).toBe('CANCELLED');
    expect(registration).toEqual(expect.objectContaining({ registration_status: 'CANCELLED', payment_status: 'REFUNDED' }));
    expect(result.status).toBe('CANCELLED');
  });

  function buildPaymentOpenCancel(escrowsById: Record<string, any>, escrowOverrides: Record<string, any> = {}) {
    const group = {
      id: 'group-1', website_id: 'site-1', initiator_user_id: 'user-1',
      status: 'PAYMENT_OPEN', workflow_step: 'PAYMENT_CONFIRMATION', order_id: 'plan-order-1',
    };
    const occurrence = { id: 'occurrence-1', parent_order_id: 'group-1', website_id: 'site-1', status: 'PAYMENT_OPEN' };
    // payment_status tersimpan sengaja basi (UNPAID) — sumber kebenaran adalah escrow.
    const registrations = [
      { id: 'reg-paid', group_id: 'group-1', website_id: 'site-1', order_id: 'seat-order-1', registration_status: 'RSVP_CONFIRMED', payment_status: 'UNPAID', invitation_id: 'invite-1' },
      { id: 'reg-pending', group_id: 'group-1', website_id: 'site-1', order_id: 'seat-order-2', registration_status: 'RSVP_CONFIRMED', payment_status: 'PENDING_PAYMENT', invitation_id: 'invite-1' },
    ];
    const orders = [
      { id: 'seat-order-1', website_id: 'site-1', parent_order_id: 'plan-order-1', transaction_id: 'tx-paid', status: 'PENDING', metadata: {} },
      { id: 'seat-order-2', website_id: 'site-1', parent_order_id: 'plan-order-1', transaction_id: 'tx-pending', status: 'PENDING', metadata: {} },
    ];
    const transactions = [
      { id: 'tx-paid', website_id: 'site-1', payment_mode: 'ESCROW', escrow_id: 'escrow-paid', status: 'PENDING_PAYMENT', checkout_url: 'https://pay/1' },
      { id: 'tx-pending', website_id: 'site-1', payment_mode: 'ESCROW', escrow_id: 'escrow-pending', status: 'PENDING_PAYMENT', checkout_url: 'https://pay/2' },
    ];
    const groupsRepo = { findOne: jest.fn().mockResolvedValue(group), save: jest.fn(async (value) => value) };
    const occurrencesRepo = { findOne: jest.fn().mockResolvedValue(occurrence), save: jest.fn(async (value) => value) };
    const registrationsRepo = { find: jest.fn().mockResolvedValue(registrations), save: jest.fn(async (value) => value) };
    const invitationsRepo = { find: jest.fn().mockResolvedValue([]), save: jest.fn(async (value) => value) };
    const ordersRepo = {
      find: jest.fn(async ({ where }) => orders.filter((order) => (where.id?._value ?? [where.id]).includes(order.id))),
      save: jest.fn(async (value) => value),
    };
    const transactionsRepo = { find: jest.fn().mockResolvedValue(transactions), save: jest.fn(async (value) => value) };
    const repoMap = new Map<any, any>([
      [WebsiteEventGroup, groupsRepo],
      [GatheringOccurrence, occurrencesRepo],
      [WebsiteEventRegistration, registrationsRepo],
      [WebsiteEventInvitation, invitationsRepo],
      [WebsiteOrder, ordersRepo],
      [WebsiteTransaction, transactionsRepo],
    ]);
    const manager = { getRepository: jest.fn((entity) => repoMap.get(entity)) };
    const escrowClient = {
      getEscrow: jest.fn(async (id: string) => escrowsById[id]),
      refund: jest.fn().mockResolvedValue({ status: 'REFUNDED' }),
      cancelPendingEscrowPayment: jest.fn().mockResolvedValue({ status: 'CLOSED' }),
      ...escrowOverrides,
    };
    const dataSource = {
      getRepository: jest.fn((entity) => repoMap.get(entity)),
      transaction: jest.fn((callback) => callback(manager)),
    };
    const service = new GatheringOccurrenceService(dataSource as any, undefined, escrowClient as any);
    return { service, group, registrations, orders, transactions, escrowClient, groupsRepo };
  }

  it('refunds held seats and cancels unpaid checkouts when cancelling during PAYMENT_OPEN, even with stale payment_status', async () => {
    const { service, group, registrations, orders, transactions, escrowClient } = buildPaymentOpenCancel({
      'escrow-paid': { id: 'escrow-paid', status: 'HELD', remaining_hold: 40000, amount_held: 40000, amount_released: 0 },
      'escrow-pending': { id: 'escrow-pending', status: 'PENDING', remaining_hold: 0, amount_held: 0, amount_released: 0 },
    });

    await service.cancelGathering('group-1', 'site-1', 'user-1', 'Venue batal');

    expect(escrowClient.cancelPendingEscrowPayment).toHaveBeenCalledWith('escrow-pending', 'gathering-initiator-cancel:occurrence-1:tx-pending');
    expect(escrowClient.refund).toHaveBeenCalledWith(
      'escrow-paid', 'gathering-initiator-cancel:occurrence-1:tx-paid', undefined, 'Gathering cancelled by initiator: Venue batal',
    );
    expect(transactions.map((transaction) => transaction.status)).toEqual(['REFUNDED', 'CANCELLED']);
    expect(registrations.map((registration) => registration.payment_status)).toEqual(['REFUNDED', 'UNPAID']);
    // Jejak ke escrow tetap ada untuk audit.
    expect(orders.map((order) => order.transaction_id)).toEqual(['tx-paid', 'tx-pending']);
    expect(group.status).toBe('CANCELLED');
  });

  it('rejects cancellation before moving any funds when a participant has already started paying', async () => {
    const { service, group, escrowClient, groupsRepo } = buildPaymentOpenCancel({
      'escrow-paid': { id: 'escrow-paid', status: 'HELD', remaining_hold: 40000, amount_held: 40000, amount_released: 0 },
      'escrow-pending': { id: 'escrow-pending', status: 'PENDING', remaining_hold: 0, amount_held: 0, amount_released: 0 },
    }, {
      cancelPendingEscrowPayment: jest.fn().mockRejectedValue(new Error('Payment has already started with the provider')),
    });

    await expect(service.cancelGathering('group-1', 'site-1', 'user-1')).rejects.toBeInstanceOf(BadRequestException);

    expect(escrowClient.refund).not.toHaveBeenCalled();
    expect(group.status).toBe('PAYMENT_OPEN');
    expect(groupsRepo.save).not.toHaveBeenCalled();
  });

  it('refuses to cancel once seat funds have been released to the seller', async () => {
    const { service, escrowClient } = buildPaymentOpenCancel({
      'escrow-paid': { id: 'escrow-paid', status: 'COMPLETED', remaining_hold: 0, amount_held: 0, amount_released: 40000 },
      'escrow-pending': { id: 'escrow-pending', status: 'PENDING', remaining_hold: 0, amount_held: 0, amount_released: 0 },
    });

    await expect(service.cancelGathering('group-1', 'site-1', 'user-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(escrowClient.cancelPendingEscrowPayment).not.toHaveBeenCalled();
    expect(escrowClient.refund).not.toHaveBeenCalled();
  });

  it('persists PAID on seat registrations whenever a held seat transaction is synced', async () => {
    const transaction = { id: 'tx-1', payment_mode: 'ESCROW', escrow_id: 'escrow-1', status: 'PENDING_PAYMENT' };
    const registrationsRepo = { update: jest.fn() };
    const ordersRepo = { find: jest.fn().mockResolvedValue([{ id: 'seat-order-1' }, { id: 'seat-order-2' }]) };
    const transactionsRepo = { save: jest.fn(async (value) => value) };
    const repoMap = new Map<any, any>([
      [WebsiteEventRegistration, registrationsRepo],
      [WebsiteOrder, ordersRepo],
      [WebsiteTransaction, transactionsRepo],
    ]);
    const dataSource = { getRepository: jest.fn((entity) => repoMap.get(entity)) };
    const escrowClient = { getEscrow: jest.fn().mockResolvedValue({ id: 'escrow-1', status: 'HELD' }) };
    const service = new GatheringOccurrenceService(dataSource as any, undefined, escrowClient as any) as any;

    await service.syncGatheringTransaction(transaction);

    expect(transaction.status).toBe('HELD');
    expect(ordersRepo.find).toHaveBeenCalledWith({ where: { transaction_id: 'tx-1' }, select: { id: true } });
    expect(registrationsRepo.update).toHaveBeenCalledWith(
      { order_id: In(['seat-order-1', 'seat-order-2']), payment_status: In(['UNPAID', 'PENDING_PAYMENT']) },
      { payment_status: 'PAID' },
    );
  });

  it('updates plan metadata only for its initiator while still in PREORDER', async () => {
    const group = {
      id: 'group-1',
      website_id: 'site-1',
      initiator_user_id: 'user-1',
      status: 'PREORDER',
      workflow_step: 'PLAN',
      title: 'Rencana lama',
      invite_policy: 'OPEN',
    };
    const { service, groups, occurrences } = buildService({ existingGroup: group });
    const eventAt = '2026-10-30T17:00:00.000Z';

    const result = await service.updatePlanForInitiator('group-1', 'site-1', 'user-1', {
      title: '  Reuni Bandung  ',
      invite_policy: 'INVITE_ONLY',
      event_at: eventAt,
    });

    expect(groups.save).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Reuni Bandung',
      invite_policy: 'INVITE_ONLY',
    }));
    expect(occurrences.save).toHaveBeenCalledWith(expect.objectContaining({
      final_schedule: new Date(eventAt),
    }));
    expect(result.occurrence.id).toBe('occurrence-1');
  });

  it('saves only selected choices from the occurrence product snapshot', async () => {
    const group = {
      id: 'group-1',
      website_id: 'site-1',
      initiator_user_id: 'user-1',
      status: 'PREORDER',
      workflow_step: 'PLAN',
      title: 'Rencana lama',
      invite_policy: 'OPEN',
    };
    const occurrence = {
      id: 'occurrence-1',
      parent_order_id: 'group-1',
      website_id: 'site-1',
      initiator_user_id: 'user-1',
      title: 'Rencana lama',
      option_groups_snapshot: [{ product_option_id: 'option-1' }, { product_option_id: 'option-2' }],
      opened_option_ids_snapshot: ['option-1', 'option-2'],
    };
    const { service, groups, occurrences } = buildService({ existingGroup: group });
    (occurrences.findOne as jest.Mock).mockResolvedValue(occurrence);

    await service.updatePlanForInitiator('group-1', 'site-1', 'user-1', {
      invite_policy: 'INVITE_ONLY',
      opened_option_ids: ['option-2'],
    });

    expect(groups.save).toHaveBeenCalledWith(expect.objectContaining({ invite_policy: 'INVITE_ONLY' }));
    expect(occurrences.save).toHaveBeenCalledWith(expect.objectContaining({
      opened_option_ids_snapshot: ['option-2'],
    }));
  });

  it('rejects an option outside the occurrence product snapshot without saving', async () => {
    const group = {
      id: 'group-1',
      website_id: 'site-1',
      initiator_user_id: 'user-1',
      status: 'PREORDER',
      workflow_step: 'PLAN',
      title: 'Rencana lama',
      invite_policy: 'OPEN',
    };
    const occurrence = {
      id: 'occurrence-1',
      parent_order_id: 'group-1',
      website_id: 'site-1',
      initiator_user_id: 'user-1',
      title: 'Rencana lama',
      option_groups_snapshot: [{ product_option_id: 'option-1' }],
      opened_option_ids_snapshot: ['option-1'],
    };
    const { service, groups, occurrences } = buildService({ existingGroup: group });
    (occurrences.findOne as jest.Mock).mockResolvedValue(occurrence);

    await expect(service.updatePlanForInitiator('group-1', 'site-1', 'user-1', {
      opened_option_ids: ['foreign-option'],
    })).rejects.toThrow('Opened gathering options must belong to the product snapshot');
    expect(groups.save).not.toHaveBeenCalled();
    expect(occurrences.save).not.toHaveBeenCalled();
  });

  it('does not update a plan owned by another tenant or initiator', async () => {
    const group = {
      id: 'group-1',
      website_id: 'site-1',
      initiator_user_id: 'user-1',
      status: 'PREORDER',
      title: 'Rencana lama',
      invite_policy: 'OPEN',
    };
    const { service, groups } = buildService({ existingGroup: group });

    await expect(service.updatePlanForInitiator('group-1', 'site-2', 'user-1', { title: 'Other' }))
      .rejects.toThrow(NotFoundException);
    await expect(service.updatePlanForInitiator('group-1', 'site-1', 'user-2', { title: 'Other' }))
      .rejects.toThrow(NotFoundException);
    expect(groups.save).not.toHaveBeenCalled();
  });

  it('updates invitation content during the invitation stage', async () => {
    const group = {
      id: 'group-1',
      website_id: 'site-1',
      initiator_user_id: 'user-1',
      status: 'PREORDER',
      workflow_step: 'INVITATIONS',
      invitation_banner_url: null,
      invitation_description: null,
    };
    const { service, groups } = buildService({ existingGroup: group });

    const result = await service.updateInvitationContent('group-1', 'site-1', 'user-1', {
      invitation_banner_url: 'https://assets.example/banner.jpg',
      invitation_description: '  Sampai jumpa di acara kami.  ',
    });

    expect(groups.save).toHaveBeenCalledWith(expect.objectContaining({
      invitation_banner_url: 'https://assets.example/banner.jpg',
      invitation_description: 'Sampai jumpa di acara kami.',
    }));
    expect(result.invitation_description).toBe('Sampai jumpa di acara kami.');
  });

  it('locks invitation content outside the invitation stage', async () => {
    const group = {
      id: 'group-1',
      website_id: 'site-1',
      initiator_user_id: 'user-1',
      status: 'RSVP_OPEN',
      workflow_step: 'INVITATION_CONFIRMATION',
    };
    const { service, groups } = buildService({ existingGroup: group });

    await expect(service.updateInvitationContent('group-1', 'site-1', 'user-1', {
      invitation_description: 'Terlambat mengubah ini.',
    })).rejects.toThrow('Invitation content can only be edited during the invitations stage');
    expect(groups.save).not.toHaveBeenCalled();
  });

  it('authorizes banner uploads only for the plan initiator during the invitation stage', async () => {
    const group = {
      id: 'group-1',
      website_id: 'site-1',
      initiator_user_id: 'user-1',
      status: 'PREORDER',
      workflow_step: 'INVITATIONS',
    };
    const { service } = buildService({ existingGroup: group });

    await expect(service.assertCanUploadInvitationBanner('group-1', 'site-1', 'user-1')).resolves.toBeUndefined();
    await expect(service.assertCanUploadInvitationBanner('group-1', 'site-1', 'user-2')).rejects.toThrow(NotFoundException);
    group.workflow_step = 'INVITATION_CONFIRMATION';
    await expect(service.assertCanUploadInvitationBanner('group-1', 'site-1', 'user-1'))
      .rejects.toThrow('Invitation banner can only be uploaded during the invitations stage');
  });

  it('creates a contact invitation with a stable UUID link and seven-day expiry', async () => {
    const group = { id: 'group-1', website_id: 'site-1', initiator_user_id: 'user-1', status: 'PREORDER', workflow_step: 'INVITATIONS' };
    const { service, invitations } = buildService({ existingGroup: group });

    const result = await service.createInvitation('group-1', 'site-1', 'user-1', {
      invitee_name: '  Budi  ',
      email: ' BUDI@Example.com ',
      whatsapp: '+62 (812)-3456-7890',
    });

    const saved = invitations.save.mock.calls[0][0];
    expect(saved.invitee_name).toBe('Budi');
    expect(saved.email).toBe('budi@example.com');
    expect(saved.whatsapp).toBe('+6281234567890');
    expect(saved.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(saved.token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.id).toBe(saved.id);
    expect(result).not.toHaveProperty('token');
    expect(result).not.toHaveProperty('token_hash');
    expect(result.expires_at.getTime()).toBeGreaterThan(Date.now() + 6 * 24 * 60 * 60 * 1000);
  });

  it('requires an email or WhatsApp contact before creating an invitation', async () => {
    const group = { id: 'group-1', website_id: 'site-1', initiator_user_id: 'user-1', status: 'PREORDER', workflow_step: 'INVITATIONS' };
    const { service, invitations } = buildService({ existingGroup: group });

    await expect(service.createInvitation('group-1', 'site-1', 'user-1', {}))
      .rejects.toThrow('Provide an email address or WhatsApp number');
    expect(invitations.save).not.toHaveBeenCalled();
  });

  it('rejects an active duplicate invitation matching either contact channel', async () => {
    const group = { id: 'group-1', website_id: 'site-1', initiator_user_id: 'user-1', status: 'PREORDER', workflow_step: 'INVITATIONS' };
    const { service, invitations } = buildService({ existingGroup: group });
    invitations.find.mockResolvedValue([{
      id: 'invite-existing',
      email: 'budi@example.com',
      whatsapp: null,
      status: 'PENDING',
      expires_at: new Date(Date.now() + 60_000),
    }]);

    await expect(service.createInvitation('group-1', 'site-1', 'user-1', {
      email: 'other@example.com',
      whatsapp: '+6281234567890',
    })).rejects.toThrow('An active invitation already exists for this contact');
    expect(invitations.save).not.toHaveBeenCalled();
  });

  it('lists invitation contacts without exposing their token hashes', async () => {
    const group = { id: 'group-1', website_id: 'site-1', initiator_user_id: 'user-1', status: 'PREORDER' };
    const { service, invitations } = buildService({ existingGroup: group });
    invitations.find.mockResolvedValue([{
      id: 'invite-1', group_id: 'group-1', website_id: 'site-1', email: 'budi@example.com',
      token_hash: 'secret-hash', status: 'PENDING', created_at: new Date(),
    }]);

    const result = await service.listInvitations('group-1', 'site-1', 'user-1');

    expect(result).toHaveLength(1);
    expect(result[0]).not.toHaveProperty('token_hash');
    expect(invitations.find).toHaveBeenCalledWith(expect.objectContaining({
      where: { group_id: 'group-1', website_id: 'site-1' },
    }));
  });

  it('revokes only an invitation belonging to the initiator-owned plan', async () => {
    const group = { id: 'group-1', website_id: 'site-1', initiator_user_id: 'user-1', status: 'PREORDER' };
    const invitation = { id: 'invite-1', group_id: 'group-1', website_id: 'site-1', status: 'PENDING', token_hash: 'secret-hash' };
    const { service: baseService, invitations, dataSource } = buildService({ existingGroup: group });
    invitations.findOne.mockResolvedValue(invitation);
    const operation = { id: 'operation-1' };
    const operations = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ ...operation, ...value })),
    };
    const originalGetRepository = dataSource.getRepository;
    dataSource.getRepository = jest.fn((entity) => entity === GatheringOperation ? operations : originalGetRepository(entity));
    const queue = { add: jest.fn().mockResolvedValue({ id: 'revoke-job-1' }) };
    const service = new GatheringOccurrenceService(dataSource as any, undefined, undefined, queue as any);

    const result = await service.revokeInvitation('group-1', 'invite-1', 'site-1', 'user-1');

    expect(invitations.findOne).toHaveBeenCalledWith({ where: { id: 'invite-1', group_id: 'group-1', website_id: 'site-1' } });
    expect(invitations.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'REVOKED', revoked_at: expect.any(Date) }));
    expect(result.operation_id).toBe('operation-1');
    expect(result.operation_status).toBe('QUEUED');
    expect(queue.add).toHaveBeenCalledWith('revoke-gathering-invitation', { operationId: 'operation-1', invitationId: 'invite-1' }, expect.any(Object));
    expect(result).not.toHaveProperty('token_hash');
  });

  it('keeps a pending invitation URL stable when the link is reopened', async () => {
    const group = { id: 'group-1', website_id: 'site-1', initiator_user_id: 'user-1', status: 'PREORDER' };
    const invitation = {
      id: 'invite-1', group_id: 'group-1', website_id: 'site-1', status: 'PENDING',
      expires_at: new Date(Date.now() + 60_000), token_hash: 'old-hash',
    };
    const { service, invitations } = buildService({ existingGroup: group });
    invitations.findOne.mockResolvedValue(invitation);

    const result = await service.rotateInvitationLink('group-1', 'invite-1', 'site-1', 'user-1');

    expect(result.invitation_id).toBe('invite-1');
    expect(result).not.toHaveProperty('token_hash');
    expect(invitation.token_hash).toBe('old-hash');
    expect(invitations.save).not.toHaveBeenCalled();
  });

  it('returns a public invite preview with only choices opened by the initiator', async () => {
    const { service, invitations, dataSource } = buildService();
    const token = Buffer.from('invite-token-for-public-preview-0123456789').toString('base64url');
    invitations.findOne.mockImplementation(async ({ where }) => ({
      id: 'invite-1',
      group_id: 'group-1',
      website_id: 'site-1',
      token_hash: where.token_hash,
      status: 'PENDING',
      max_uses: 1,
      use_count: 0,
      expires_at: new Date(Date.now() + 60_000),
      invitee_name: 'Budi',
    }));
    const groupRepo = dataSource.getRepository(WebsiteEventGroup) as any;
    const occurrenceRepo = dataSource.getRepository(GatheringOccurrence) as any;
    const registrationRepo = dataSource.getRepository(WebsiteEventRegistration) as any;
    registrationRepo.find.mockResolvedValue([
      { selected_options: { venue: 'option-1' } },
      { selected_options: { venue: 'option-1' } },
      { selected_options: { venue: 'option-2' } },
    ]);
    groupRepo.findOne.mockResolvedValue({
      id: 'group-1',
      website_id: 'site-1',
      title: 'Reuni',
      status: 'PREORDER',
      invitation_banner_url: 'https://assets.example/banner.jpg',
      invitation_description: 'Berkumpul bersama keluarga.',
    });
    occurrenceRepo.findOne.mockResolvedValue({
      id: 'occurrence-1', website_id: 'site-1', parent_order_id: 'group-1', status: 'PREORDER',
      price_per_seat: 150000, currency: 'IDR', min_attendees: 5, max_attendees: 30,
      opened_option_ids_snapshot: ['option-1', 'option-2'],
      option_groups_snapshot: [
        { product_option_id: 'option-1', option_group_key: 'venue', label: 'Resto A' },
        { product_option_id: 'option-2', option_group_key: 'venue', label: 'Resto B' },
        { product_option_id: 'option-3', option_group_key: 'venue', label: 'Resto C' },
      ],
    });

    const result = await service.getInvitationPreview(token);

    expect(result.group.title).toBe('Reuni');
    expect(result.group.invitation_banner_url).toBe('https://assets.example/banner.jpg');
    expect(result.group.invitation_description).toBe('Berkumpul bersama keluarga.');
    expect(result.occurrence.options).toEqual([
      { product_option_id: 'option-1', option_group_key: 'venue', label: 'Resto A' },
      { product_option_id: 'option-2', option_group_key: 'venue', label: 'Resto B' },
    ]);
    expect(result.occurrence.voting_results.venue).toEqual({
      total_votes: 3,
      options: {
        'option-1': { votes: 2, percentage: 67 },
        'option-2': { votes: 1, percentage: 33 },
      },
    });
    expect(result.invitation).not.toHaveProperty('email');
  });

  it('requires the signed-in private invitee email to match before registering', async () => {
    const invitation = {
      id: 'invite-1', group_id: 'group-1', website_id: 'site-1', status: 'PENDING',
      max_uses: 1, use_count: 0, expires_at: new Date(Date.now() + 60_000),
      email: 'budi@example.com', whatsapp: null,
    };
    const group = { id: 'group-1', website_id: 'site-1', invite_policy: 'INVITE_ONLY', workflow_step: 'INVITATION_CONFIRMATION', status: 'RSVP_OPEN' };
    const occurrence = {
      id: 'occurrence-1', parent_order_id: 'group-1', website_id: 'site-1', status: 'RSVP_OPEN',
      rsvp_close_at: new Date(Date.now() + 60_000), max_attendees: 10,
      opened_option_ids_snapshot: ['option-1'], option_groups_snapshot: [{ product_option_id: 'option-1', option_group_key: 'venue' }],
    };
    const invitationRepo = { findOne: jest.fn().mockResolvedValue(invitation) };
    const groupRepo = { findOne: jest.fn().mockResolvedValue(group) };
    const occurrenceRepo = { findOne: jest.fn().mockResolvedValue(occurrence) };
    const registrationRepo = { findOne: jest.fn(), count: jest.fn(), create: jest.fn(), save: jest.fn() };
    const repositories = new Map<any, any>([
      [WebsiteEventInvitation, invitationRepo],
      [WebsiteEventGroup, groupRepo],
      [GatheringOccurrence, occurrenceRepo],
      [WebsiteEventRegistration, registrationRepo],
    ]);
    const manager = { getRepository: jest.fn((entity) => repositories.get(entity)) };
    const dataSource = { transaction: jest.fn((callback) => callback(manager)) };
    const service = new GatheringOccurrenceService(dataSource as any);

    await expect(service.submitRsvp('invite-1', {
      attendee_name: 'Budi', email: 'budi@example.com', selected_options: { venue: 'option-1' },
    }, { userId: 'another-user', email: 'other@example.com' })).rejects.toThrow('Sign in with the email address this invitation was sent to');
    expect(registrationRepo.save).not.toHaveBeenCalled();
  });

  it('rejects direct RSVP submissions for open invitations before email verification', async () => {
    const invitation = {
      id: 'open-invite', group_id: 'group-1', website_id: 'site-1', status: 'PENDING',
      max_uses: 2, use_count: 0, expires_at: new Date(Date.now() + 60_000), email: null, whatsapp: null,
    };
    const group = { id: 'group-1', website_id: 'site-1', invite_policy: 'OPEN', workflow_step: 'INVITATION_CONFIRMATION', status: 'RSVP_OPEN' };
    const occurrence = {
      id: 'occurrence-1', parent_order_id: 'group-1', website_id: 'site-1', status: 'RSVP_OPEN',
      rsvp_close_at: new Date(Date.now() + 60_000), max_attendees: 2,
      opened_option_ids_snapshot: ['option-1'], option_groups_snapshot: [{ product_option_id: 'option-1', option_group_key: 'venue' }],
    };
    const invitationRepo = { findOne: jest.fn().mockResolvedValue(invitation), save: jest.fn(async (value) => value) };
    const groupRepo = { findOne: jest.fn().mockResolvedValue(group) };
    const occurrenceRepo = { findOne: jest.fn().mockResolvedValue(occurrence) };
    const registrationRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: 'registration-1', ...value })),
    };
    const repositories = new Map<any, any>([
      [WebsiteEventInvitation, invitationRepo],
      [WebsiteEventGroup, groupRepo],
      [GatheringOccurrence, occurrenceRepo],
      [WebsiteEventRegistration, registrationRepo],
    ]);
    const manager = { getRepository: jest.fn((entity) => repositories.get(entity)) };
    const dataSource = { transaction: jest.fn((callback) => callback(manager)) };
    const service = new GatheringOccurrenceService(dataSource as any);

    await expect(service.submitRsvp('open-invite', {
      attendee_name: 'Ani', email: 'ani@example.com', selected_options: { venue: 'option-1' },
    })).rejects.toThrow('Open RSVP requires email verification');

    expect(registrationRepo.save).not.toHaveBeenCalled();
    expect(invitation.use_count).toBe(0);
    expect(invitation.status).toBe('PENDING');
  });

  it('requires RSVP count within attendee bounds before opening seat payments', async () => {
    const group = {
      id: 'group-1', website_id: 'site-1', initiator_user_id: 'user-1',
      status: 'RSVP_OPEN', workflow_step: 'INVITATION_CONFIRMATION',
    };
    const occurrence = {
      id: 'occurrence-1', parent_order_id: 'group-1', website_id: 'site-1',
      status: 'RSVP_OPEN', min_attendees: 2, max_attendees: 2, final_schedule: new Date(Date.now() + 10 * 86400000),
      payment_deadline: new Date(Date.now() + 5 * 86400000),
      price_per_seat: 125000,
      currency: 'IDR',
    };
    const groupRepo = {
      findOne: jest.fn().mockResolvedValue(group),
      save: jest.fn(async (value) => value),
    };
    const occurrenceRepo = {
      findOne: jest.fn().mockResolvedValue(occurrence),
      save: jest.fn(async (value) => value),
    };
    const registration = {
      id: 'registration-1', attendee_name: 'Guest', email: 'guest@example.com',
      registration_status: 'RSVP_CONFIRMED', payment_status: 'UNPAID',
      invoice_issued_at: null as Date | null, invoice_email_sent_at: null as Date | null,
    };
    const registrations = {
      find: jest.fn().mockResolvedValue([registration]),
      save: jest.fn(async (value) => value),
    };
    const websites = { findOne: jest.fn().mockResolvedValue({ id: 'site-1', name: 'Gathering', slug: 'gathering', domain_verified_at: null }) };
    let savedOperation: any;
    const operations = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => {
        savedOperation = { ...savedOperation, ...value, id: 'operation-1' };
        return savedOperation;
      }),
      findOne: jest.fn(async () => savedOperation),
    };
    const repositories = new Map<any, any>([
      [WebsiteEventGroup, groupRepo],
      [GatheringOccurrence, occurrenceRepo],
      [WebsiteEventRegistration, registrations],
      [Website, websites],
      [GatheringOperation, operations],
    ]);
    const manager = { getRepository: jest.fn((entity) => repositories.get(entity)) };
    const dataSource = {
      transaction: jest.fn((callback) => callback(manager)),
      getRepository: jest.fn((entity) => repositories.get(entity)),
    };
    const messaging = { gatheringInvoiceTemplate: 'GatheringInvoice', sendEmail: jest.fn().mockResolvedValue(true) };
    const queue = { add: jest.fn().mockResolvedValue({ id: 'invoice-job-1' }) };
    const service = new GatheringOccurrenceService(dataSource as any, messaging as any, undefined, queue as any);

    await expect(service.confirmReservations('group-1', 'site-1', 'user-1'))
      .rejects.toThrow('Minimum confirmed RSVPs not reached (1/2)');
    expect(group.workflow_step).toBe('INVITATION_CONFIRMATION');

    registrations.find.mockResolvedValueOnce([
      registration,
      { ...registration, id: 'registration-2', email: 'guest-2@example.com', invoice_issued_at: null, invoice_email_sent_at: null },
      { ...registration, id: 'registration-3', email: 'guest-3@example.com', invoice_issued_at: null, invoice_email_sent_at: null },
    ]);
    await expect(service.confirmReservations('group-1', 'site-1', 'user-1'))
      .rejects.toThrow('Confirmed RSVPs exceed the gathering capacity (3/2)');
    expect(group.workflow_step).toBe('INVITATION_CONFIRMATION');

    registrations.find.mockResolvedValueOnce([
      registration,
      { ...registration, id: 'registration-2', email: 'guest-2@example.com', invoice_issued_at: null, invoice_email_sent_at: null },
    ]);

    const result = await service.confirmReservations('group-1', 'site-1', 'user-1');

    expect(result).toEqual(expect.objectContaining({
      registration_count: 2,
      invoice_operation_id: 'operation-1',
      invoice_operation_status: 'QUEUED',
      invoice_email_total: 2,
    }));
    expect(registration).toEqual(expect.objectContaining({ invoice_is_public: true, invoice_issued_at: expect.any(Date) }));
    expect(queue.add).toHaveBeenCalledWith('issue-gathering-invoices', { operationId: 'operation-1' }, expect.objectContaining({ jobId: 'gathering-invoices-operation-1' }));
    expect(messaging.sendEmail).not.toHaveBeenCalled();
    expect(group.workflow_step).toBe('PAYMENT_CONFIRMATION');
    expect(group.status).toBe('PAYMENT_OPEN');
    expect(occurrence.status).toBe('PAYMENT_OPEN');

    const retryResult = await service.confirmReservations('group-1', 'site-1', 'user-1');
    expect(retryResult).toEqual(expect.objectContaining({
      already_confirmed: true,
      invoice_operation_id: 'operation-1',
      invoice_operation_status: 'QUEUED',
    }));
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('queues resend invoice emails only for unpaid registrations', async () => {
    const group = {
      id: 'group-1',
      website_id: 'site-1',
      initiator_user_id: 'user-1',
      status: 'PAYMENT_OPEN',
    };
    const { service, dataSource, registrations, gatheringOperations } = buildService({ existingGroup: group });
    const unpaid = {
      id: 'unpaid-1',
      email: 'unpaid@example.com',
      payment_status: 'UNPAID',
      registration_status: 'RSVP_CONFIRMED',
      invoice_issued_at: new Date(),
      invoice_email_sent_at: new Date(),
    };
    const paid = {
      id: 'paid-1',
      email: 'paid@example.com',
      payment_status: 'PAID',
      registration_status: 'RSVP_CONFIRMED',
      invoice_issued_at: new Date(),
      invoice_email_sent_at: new Date(),
    };
    registrations.find.mockResolvedValue([unpaid, paid]);
    gatheringOperations.findOne.mockResolvedValue(null);
    const queue = { add: jest.fn().mockResolvedValue({ id: 'invoice-job-1' }) };
    const queueService = new GatheringOccurrenceService(dataSource as any, undefined, undefined, queue as any);

    const result = await queueService.resendInvoiceEmails('group-1', 'site-1', 'user-1');

    expect(result).toEqual(expect.objectContaining({
      operation_id: 'operation-1',
      operation_status: 'QUEUED',
      total_count: 1,
    }));
    expect(registrations.save).toHaveBeenCalledWith([expect.objectContaining({ id: 'unpaid-1', invoice_email_sent_at: null })]);
    expect(queue.add).toHaveBeenCalledWith('issue-gathering-invoices', { operationId: 'operation-1' }, expect.objectContaining({ jobId: 'gathering-invoices-operation-1' }));
  });

  it('exposes only a public-safe invoice summary without attendee contact details', async () => {
    const registration = {
      id: 'registration-1', website_id: 'site-1', group_id: 'group-1', occurrence_id: 'occurrence-1',
      attendee_name: 'Private Guest', email: 'private@example.com', whatsapp: '+628123456789',
      payment_status: 'UNPAID', invoice_is_public: true, invoice_issued_at: new Date(), order_id: null,
    };
    const group = { id: 'group-1', title: 'Gathering Test', status: 'PAYMENT_OPEN' };
    const occurrence = {
      id: 'occurrence-1', parent_order_id: 'group-1', website_id: 'site-1', status: 'PAYMENT_OPEN',
      price_per_seat: 250000, currency: 'IDR', payment_deadline: new Date(Date.now() + 86400000), final_schedule: null,
    };
    const repositories = new Map<any, any>([
      [WebsiteEventRegistration, { findOne: jest.fn().mockResolvedValue(registration) }],
      [WebsiteEventGroup, { findOne: jest.fn().mockResolvedValue(group) }],
      [GatheringOccurrence, { findOne: jest.fn().mockResolvedValue(occurrence) }],
    ]);
    const service = new GatheringOccurrenceService({ getRepository: jest.fn((entity) => repositories.get(entity)) } as any);

    const result = await service.getPublicInvoice('registration-1');

    expect(result).toEqual(expect.objectContaining({
      id: 'registration-1', gathering_title: 'Gathering Test', attendee_name: 'Private Guest', amount: 250000, currency: 'IDR', payment_open: true,
    }));
    expect(result).not.toHaveProperty('email');
    expect(result).not.toHaveProperty('whatsapp');
  });

  it('lists a confirmed RSVP invoice as scheduled before the initiator opens payments', async () => {
    const registration = {
      id: 'registration-pending-issue', website_id: 'site-1', group_id: 'group-1', occurrence_id: 'occurrence-1',
      attendee_name: 'Guest', email: 'guest@example.com', registration_status: 'RSVP_CONFIRMED',
      payment_status: 'UNPAID', invoice_issued_at: null, payer_user_id: null,
    };
    const repositories = new Map<any, any>([
      [WebsiteEventRegistration, { find: jest.fn().mockResolvedValue([registration]) }],
      [WebsiteEventGroup, { findOne: jest.fn().mockResolvedValue({ id: 'group-1', initiator_user_id: 'initiator-1', title: 'Gathering' }) }],
      [GatheringOccurrence, { findOne: jest.fn().mockResolvedValue({ id: 'occurrence-1', price_per_seat: 25000, currency: 'IDR', payment_deadline: null, final_schedule: null }) }],
    ]);
    const service = new GatheringOccurrenceService({ getRepository: jest.fn((entity) => repositories.get(entity)) } as any);

    const result = await service.listInvoicesForUser({ userId: 'guest-user', email: 'guest@example.com' } as any, 'site-1');

    expect(result).toEqual([expect.objectContaining({
      id: 'registration-pending-issue',
      payment_status: 'NOT_ISSUED',
      invoice_status: 'SCHEDULED',
      invoice_issued_at: null,
      can_pay: false,
      is_initiator: false,
    })]);
  });

  it('exposes the escrow transaction group only in the signed-in invoice list context', async () => {
    const registration = {
      id: 'registration-1', website_id: 'site-1', group_id: 'group-1', occurrence_id: 'occurrence-1',
      payment_status: 'UNPAID', invoice_is_public: true, invoice_issued_at: new Date(), order_id: 'seat-order-1',
    };
    const repositories = new Map<any, any>([
      [WebsiteEventRegistration, { findOne: jest.fn().mockResolvedValue(registration), save: jest.fn(async (value) => value) }],
      [WebsiteEventGroup, { findOne: jest.fn().mockResolvedValue({ id: 'group-1', title: 'Gathering Test', status: 'PAYMENT_OPEN' }) }],
      [GatheringOccurrence, { findOne: jest.fn().mockResolvedValue({
        id: 'occurrence-1', website_id: 'site-1', status: 'PAYMENT_OPEN', price_per_seat: 250000,
        currency: 'IDR', payment_deadline: null, final_schedule: null,
      }) }],
      [WebsiteOrder, { findOne: jest.fn().mockResolvedValue({ id: 'seat-order-1', transaction_id: 'transaction-1' }) }],
      [WebsiteTransaction, { findOne: jest.fn().mockResolvedValue({ id: 'transaction-1', buyer_user_id: 'buyer-1', status: 'PENDING_PAYMENT' }) }],
    ]);
    const service = new GatheringOccurrenceService({ getRepository: jest.fn((entity) => repositories.get(entity)) } as any);

    const publicInvoice = await service.getPublicInvoice('registration-1');
    const buyerInvoice = await service.getPublicInvoice('registration-1', 'buyer-1');

    expect(publicInvoice).not.toHaveProperty('transaction_id');
    expect(buyerInvoice).toEqual(expect.objectContaining({
      transaction_id: 'transaction-1',
      can_view_transaction: true,
    }));
  });

  it('creates collective seat orders owned by the initiator and forces escrow payment mode', async () => {
    const group = { id: 'group-1', website_id: 'site-1', initiator_user_id: 'user-1', order_id: 'plan-order-1', status: 'PAYMENT_OPEN' };
    const occurrence = { id: 'occurrence-1', parent_order_id: 'group-1', website_id: 'site-1', product_id: 'product-1', status: 'PAYMENT_OPEN', price_per_seat: 125000, currency: 'IDR' };
    const registration = {
      id: 'registration-1', group_id: 'group-1', website_id: 'site-1', occurrence_id: 'occurrence-1',
      registration_status: 'RSVP_CONFIRMED', payment_status: 'UNPAID', invoice_issued_at: new Date(),
      order_id: null, buyer_user_id: null, payer_user_id: null,
    };
    const groups = { findOne: jest.fn().mockResolvedValue(group) };
    const occurrences = { findOne: jest.fn().mockResolvedValue(occurrence) };
    const registrations = { find: jest.fn().mockResolvedValue([registration]), save: jest.fn(async (value) => value) };
    const products = { findOne: jest.fn().mockResolvedValue(product) };
    const orders = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: 'seat-order-1', ...value })),
    };
    const repositories = new Map<any, any>([
      [WebsiteEventGroup, groups], [GatheringOccurrence, occurrences],
      [WebsiteEventRegistration, registrations], [WebsiteProduct, products], [WebsiteOrder, orders],
    ]);
    const manager = { getRepository: jest.fn((entity) => repositories.get(entity)) };
    const service = new GatheringOccurrenceService({ transaction: jest.fn((callback) => callback(manager)) } as any);

    const result = await service.createInitiatorSeatOrders('group-1', 'site-1', initiator, ['registration-1']);

    expect(result).toHaveLength(1);
    expect(orders.save).toHaveBeenCalledWith(expect.objectContaining({ buyer_user_id: 'user-1', payment_mode: 'ESCROW', total_amount: 125000 }));
    expect(registration).toEqual(expect.objectContaining({ buyer_user_id: 'user-1', payer_user_id: 'user-1', order_id: 'seat-order-1' }));
  });

  it('cancels an unstarted participant checkout and makes the seat eligible for initiator collective payment', async () => {
    const group = { id: 'group-1', website_id: 'site-1', initiator_user_id: 'user-1', order_id: 'plan-order-1', status: 'PAYMENT_OPEN' };
    const registration = {
      id: 'registration-1', group_id: 'group-1', website_id: 'site-1', registration_status: 'RSVP_CONFIRMED',
      payment_status: 'PENDING_PAYMENT', invoice_issued_at: new Date(), order_id: 'seat-order-1', payer_user_id: 'participant-1',
    };
    const order = { id: 'seat-order-1', website_id: 'site-1', parent_order_id: 'plan-order-1', transaction_id: 'participant-tx', status: 'PENDING' };
    const transaction = { id: 'participant-tx', website_id: 'site-1', status: 'PENDING_PAYMENT', payment_mode: 'ESCROW', escrow_id: 'escrow-1', checkout_url: 'https://pay.example/old' };
    const groups = { findOne: jest.fn().mockResolvedValue(group) };
    const registrations = { findOne: jest.fn().mockResolvedValue(registration), save: jest.fn(async (value) => value) };
    const orders = { findOne: jest.fn().mockResolvedValue(order), save: jest.fn(async (value) => value) };
    const transactions = { findOne: jest.fn().mockResolvedValue(transaction), save: jest.fn(async (value) => value) };
    const repositories = new Map<any, any>([
      [WebsiteEventGroup, groups], [WebsiteEventRegistration, registrations],
      [WebsiteOrder, orders], [WebsiteTransaction, transactions],
    ]);
    const manager = { getRepository: jest.fn((entity) => repositories.get(entity)) };
    const escrowClient = {
      getEscrow: jest.fn().mockResolvedValue({ status: 'PENDING' }),
      cancelPendingEscrowPayment: jest.fn().mockResolvedValue({ status: 'CLOSED' }),
    };
    const service = new GatheringOccurrenceService({ transaction: jest.fn((callback) => callback(manager)) } as any, undefined, escrowClient as any);

    const result = await service.cancelParticipantCheckout('group-1', 'site-1', initiator, 'registration-1');

    expect(escrowClient.cancelPendingEscrowPayment).toHaveBeenCalledWith('escrow-1', 'gathering-checkout-takeover:registration-1:participant-tx');
    expect(transaction).toEqual(expect.objectContaining({ status: 'CANCELLED', checkout_url: null }));
    expect(order).toEqual(expect.objectContaining({ status: 'PENDING', transaction_id: null, buyer_user_id: 'user-1', buyer_identifier: 'initiator@example.com' }));
    expect(registration).toEqual(expect.objectContaining({ payment_status: 'UNPAID', buyer_user_id: 'user-1', payer_user_id: null }));
    expect(result.payment_status).toBe('UNPAID');
  });

  it('cancels a participant checkout whose registration was never marked pending and whose transaction kept the raw escrow status', async () => {
    const group = { id: 'group-1', website_id: 'site-1', initiator_user_id: 'user-1', order_id: 'plan-order-1', status: 'PAYMENT_OPEN' };
    const registration = {
      id: 'registration-1', group_id: 'group-1', website_id: 'site-1', registration_status: 'RSVP_CONFIRMED',
      payment_status: 'UNPAID', invoice_issued_at: new Date(), order_id: 'seat-order-1',
      buyer_user_id: 'participant-1', payer_user_id: 'participant-1',
    };
    const order = { id: 'seat-order-1', website_id: 'site-1', parent_order_id: 'plan-order-1', transaction_id: 'participant-tx', status: 'PENDING', buyer_user_id: 'participant-1' };
    const transaction = { id: 'participant-tx', website_id: 'site-1', status: 'PENDING', payment_mode: 'ESCROW', escrow_id: 'escrow-1', checkout_url: 'https://pay.example/old' };
    const repositories = new Map<any, any>([
      [WebsiteEventGroup, { findOne: jest.fn().mockResolvedValue(group) }],
      [WebsiteEventRegistration, { findOne: jest.fn().mockResolvedValue(registration), save: jest.fn(async (value) => value) }],
      [WebsiteOrder, { findOne: jest.fn().mockResolvedValue(order), save: jest.fn(async (value) => value) }],
      [WebsiteTransaction, { findOne: jest.fn().mockResolvedValue(transaction), save: jest.fn(async (value) => value) }],
    ]);
    const manager = { getRepository: jest.fn((entity) => repositories.get(entity)) };
    const escrowClient = { cancelPendingEscrowPayment: jest.fn().mockResolvedValue({ status: 'CLOSED' }) };
    const service = new GatheringOccurrenceService({ transaction: jest.fn((callback) => callback(manager)) } as any, undefined, escrowClient as any);

    await service.cancelParticipantCheckout('group-1', 'site-1', initiator, 'registration-1');

    expect(escrowClient.cancelPendingEscrowPayment).toHaveBeenCalledWith('escrow-1', 'gathering-checkout-takeover:registration-1:participant-tx');
    expect(transaction.status).toBe('CANCELLED');
    expect(order).toEqual(expect.objectContaining({ transaction_id: null, buyer_user_id: 'user-1' }));
    expect(registration).toEqual(expect.objectContaining({ payment_status: 'UNPAID', buyer_user_id: 'user-1', payer_user_id: null }));
  });

  it('refuses to cancel a seat that is already paid', async () => {
    const group = { id: 'group-1', website_id: 'site-1', initiator_user_id: 'user-1', order_id: 'plan-order-1', status: 'PAYMENT_OPEN' };
    const registration = {
      id: 'registration-1', group_id: 'group-1', website_id: 'site-1', registration_status: 'RSVP_CONFIRMED',
      payment_status: 'PAID', invoice_issued_at: new Date(), order_id: 'seat-order-1',
    };
    const repositories = new Map<any, any>([
      [WebsiteEventGroup, { findOne: jest.fn().mockResolvedValue(group) }],
      [WebsiteEventRegistration, { findOne: jest.fn().mockResolvedValue(registration) }],
    ]);
    const manager = { getRepository: jest.fn((entity) => repositories.get(entity)) };
    const escrowClient = { cancelPendingEscrowPayment: jest.fn() };
    const service = new GatheringOccurrenceService({ transaction: jest.fn((callback) => callback(manager)) } as any, undefined, escrowClient as any);

    await expect(service.cancelParticipantCheckout('group-1', 'site-1', initiator, 'registration-1')).rejects.toThrow('Only a participant seat with an issued, pending checkout can be cancelled');
    expect(escrowClient.cancelPendingEscrowPayment).not.toHaveBeenCalled();
  });

  it('starts a new collective checkout for a seat whose participant checkout was cancelled by the initiator', async () => {
    const group = { id: 'group-1', order_id: 'plan-order-1', website_id: 'site-1', initiator_user_id: 'user-1', status: 'PAYMENT_OPEN' };
    const registration = {
      id: 'registration-1', group_id: 'group-1', website_id: 'site-1',
      registration_status: 'RSVP_CONFIRMED', payment_status: 'UNPAID', invoice_issued_at: new Date(),
      order_id: 'seat-order-1', buyer_user_id: 'user-1',
    };
    const transactions = { findOne: jest.fn() };
    const repositories = new Map<any, any>([
      [WebsiteEventGroup, { findOne: jest.fn().mockResolvedValue(group) }],
      [WebsiteEventRegistration, { find: jest.fn().mockResolvedValue([registration]) }],
      [WebsiteOrder, { find: jest.fn().mockResolvedValue([{ id: 'seat-order-1', buyer_user_id: 'user-1', transaction_id: null }]) }],
      [WebsiteTransaction, transactions],
    ]);
    const service = new GatheringOccurrenceService({ getRepository: jest.fn((entity) => repositories.get(entity)) } as any);

    await expect(service.findCollectiveCheckoutToRetry('group-1', 'site-1', initiator, ['registration-1'])).resolves.toBeNull();
    expect(transactions.findOne).not.toHaveBeenCalled();
  });

  it('continues a pending collective checkout whose seats are already marked PENDING_PAYMENT', async () => {
    const group = { id: 'group-1', order_id: 'plan-order-1', website_id: 'site-1', initiator_user_id: 'user-1', status: 'PAYMENT_OPEN' };
    const registrationRows = ['registration-1', 'registration-2'].map((id, index) => ({
      id, group_id: 'group-1', website_id: 'site-1',
      registration_status: 'RSVP_CONFIRMED', payment_status: 'PENDING_PAYMENT', invoice_issued_at: new Date(),
      order_id: `seat-order-${index + 1}`,
    }));
    const repositories = new Map<any, any>([
      [WebsiteEventGroup, { findOne: jest.fn().mockResolvedValue(group) }],
      [WebsiteEventRegistration, { find: jest.fn().mockResolvedValue(registrationRows) }],
      [WebsiteOrder, { find: jest.fn().mockResolvedValue([
        { id: 'seat-order-1', buyer_user_id: 'user-1', transaction_id: 'transaction-1' },
        { id: 'seat-order-2', buyer_user_id: 'user-1', transaction_id: 'transaction-1' },
      ]) }],
      [WebsiteTransaction, { findOne: jest.fn().mockResolvedValue({ id: 'transaction-1', status: 'PENDING_PAYMENT' }) }],
    ]);
    const service = new GatheringOccurrenceService({ getRepository: jest.fn((entity) => repositories.get(entity)) } as any);

    await expect(service.findCollectiveCheckoutToRetry('group-1', 'site-1', initiator, ['registration-1', 'registration-2']))
      .resolves.toEqual({ transaction_id: 'transaction-1', plan_order_id: 'plan-order-1' });
  });

  it('finds the existing pending collective checkout for retry instead of claiming its orders again', async () => {
    const group = { id: 'group-1', order_id: 'plan-order-1', website_id: 'site-1', initiator_user_id: 'user-1', status: 'PAYMENT_OPEN' };
    const registration = {
      id: 'registration-1', group_id: 'group-1', website_id: 'site-1',
      registration_status: 'RSVP_CONFIRMED', payment_status: 'UNPAID', invoice_issued_at: new Date(),
      order_id: 'seat-order-1',
    };
    const transaction = { id: 'transaction-1', website_id: 'site-1', buyer_user_id: 'user-1', status: 'PENDING_PAYMENT' };
    const groups = { findOne: jest.fn().mockResolvedValue(group) };
    const registrations = { find: jest.fn().mockResolvedValue([registration]) };
    const orders = { find: jest.fn().mockResolvedValue([{ id: 'seat-order-1', buyer_user_id: 'user-1', transaction_id: 'transaction-1' }]) };
    const transactions = { findOne: jest.fn().mockResolvedValue(transaction) };
    const repositories = new Map<any, any>([
      [WebsiteEventGroup, groups],
      [WebsiteEventRegistration, registrations],
      [WebsiteOrder, orders],
      [WebsiteTransaction, transactions],
    ]);
    const service = new GatheringOccurrenceService({ getRepository: jest.fn((entity) => repositories.get(entity)) } as any);

    await expect(service.findCollectiveCheckoutToRetry('group-1', 'site-1', initiator, ['registration-1']))
      .resolves.toEqual({ transaction_id: 'transaction-1', plan_order_id: 'plan-order-1' });
    expect(transactions.findOne).toHaveBeenCalledWith({
      where: { id: 'transaction-1', website_id: 'site-1', buyer_user_id: 'user-1' },
    });
  });

  it('refunds only the selected seat amount and keeps that seat refunded in a still-held collective escrow', async () => {
    const group = { id: 'group-1', website_id: 'site-1', initiator_user_id: 'user-1', status: 'PAYMENT_OPEN' };
    const registration = {
      id: 'registration-1', group_id: 'group-1', website_id: 'site-1', registration_status: 'RSVP_CONFIRMED',
      order_id: 'seat-order-1', payer_user_id: 'user-1', payment_status: 'PAID',
    };
    const order = { id: 'seat-order-1', transaction_id: 'transaction-1', total_amount: 125000 };
    const transaction = { id: 'transaction-1', payment_mode: 'ESCROW', escrow_id: 'escrow-1', status: 'HELD' };
    const groups = { findOne: jest.fn().mockResolvedValue(group) };
    const registrations = { findOne: jest.fn().mockResolvedValue(registration), save: jest.fn(async (value) => value) };
    const orders = { findOne: jest.fn().mockResolvedValue(order) };
    const transactions = { findOne: jest.fn().mockResolvedValue(transaction), save: jest.fn(async (value) => value) };
    const repositories = new Map<any, any>([
      [WebsiteEventGroup, groups], [WebsiteEventRegistration, registrations],
      [WebsiteOrder, orders], [WebsiteTransaction, transactions],
    ]);
    const manager = { getRepository: jest.fn((entity) => repositories.get(entity)) };
    const escrowClient = {
      getEscrow: jest.fn().mockResolvedValue({ status: 'HELD' }),
      refund: jest.fn().mockResolvedValue({ status: 'HELD' }),
    };
    const dataSource = {
      transaction: jest.fn((callback) => callback(manager)),
      getRepository: jest.fn((entity) => repositories.get(entity)),
    };
    const service = new GatheringOccurrenceService(dataSource as any, undefined, escrowClient as any);

    const result = await service.refundRegistration('group-1', 'site-1', 'registration-1', 'user-1');

    expect(escrowClient.refund).toHaveBeenCalledWith('escrow-1', 'gathering-seat-refund:registration-1', 125000, 'Gathering seat refund registration-1');
    expect(result).toEqual(expect.objectContaining({ refund_amount: 125000, escrow_status: 'HELD', payer_user_id: 'user-1' }));
    expect(registration).toEqual(expect.objectContaining({ registration_status: 'CANCELLED', payment_status: 'REFUNDED' }));
    expect(transaction.status).toBe('HELD');
  });

  it('confirms a gathering after paid minimum without releasing participant escrow', async () => {
    const group = {
      id: 'group-1', website_id: 'site-1', initiator_user_id: 'user-1',
      status: 'PAYMENT_OPEN', workflow_step: 'PAYMENT_CONFIRMATION',
    };
    const occurrence = {
      id: 'occurrence-1', parent_order_id: 'group-1', website_id: 'site-1',
      status: 'PAYMENT_OPEN', min_attendees: 1, max_attendees: 5,
      deposit_amount_per_seat: 25000,
      opened_option_ids_snapshot: ['option-1'],
      option_groups_snapshot: [{ product_option_id: 'option-1', option_group_key: 'venue', label: 'Aula' }],
    };
    const registration = { id: 'registration-1', group_id: 'group-1', website_id: 'site-1', order_id: 'order-seat-1', registration_status: 'RSVP_CONFIRMED', payment_status: 'PAID' };
    const order = { id: 'order-seat-1', transaction_id: 'transaction-1', quantity: 1 };
    const transaction = { id: 'transaction-1', payment_mode: 'ESCROW', escrow_id: 'escrow-1', status: 'HELD', total_amount: 125000 };
    const groups = { findOne: jest.fn().mockResolvedValue(group), save: jest.fn(async (value) => value) };
    const occurrences = { findOne: jest.fn().mockResolvedValue(occurrence), save: jest.fn(async (value) => value) };
    const registrations = { find: jest.fn().mockResolvedValue([registration]) };
    const orders = { find: jest.fn().mockResolvedValue([order]) };
    const transactions = { find: jest.fn().mockResolvedValue([transaction]), save: jest.fn(async (value) => value) };
    const repositories = new Map<any, any>([
      [WebsiteEventGroup, groups],
      [GatheringOccurrence, occurrences],
      [WebsiteEventRegistration, registrations],
      [WebsiteOrder, orders],
      [WebsiteTransaction, transactions],
    ]);
    const manager = { getRepository: jest.fn((entity) => repositories.get(entity)) };
    const escrowClient = {
      getEscrow: jest.fn().mockResolvedValue({ id: 'escrow-1', status: 'HELD', remaining_hold: 125000 }),
      release: jest.fn().mockResolvedValue({ escrowStatus: 'COMPLETED' }),
    };
    const dataSource = {
      getRepository: jest.fn((entity) => repositories.get(entity)),
      transaction: jest.fn((callback) => callback(manager)),
    };
    const service = new GatheringOccurrenceService(dataSource as any, undefined, escrowClient as any);

    const result = await service.confirmGathering('group-1', 'site-1', 'user-1', {
      final_selections: [{ option_group_key: 'venue', option_id: 'option-1' }],
    });

    expect(result.paid_seat_count).toBe(1);
    expect(result.released_deposit_total).toBe(0);
    expect(group.status).toBe('CONFIRMED');
    expect(occurrence.status).toBe('CONFIRMED');
    expect(escrowClient.release).not.toHaveBeenCalled();
    expect(occurrence.option_groups_snapshot[0]).toEqual(expect.objectContaining({ is_final_selection: true }));
  });

  it('records a visible operation error when the messaging service rejects invoice delivery', async () => {
    const operation = {
      id: 'operation-1', kind: 'INVOICE_ISSUANCE', website_id: 'site-1', group_id: 'group-1',
      initiator_user_id: 'user-1', status: 'QUEUED', total_count: 1, processed_count: 0,
      success_count: 0, failed_count: 0, failed_items: [], error_message: null,
    };
    const registration = {
      id: 'registration-1', group_id: 'group-1', website_id: 'site-1', registration_status: 'RSVP_CONFIRMED',
      invoice_issued_at: new Date(), invoice_email_sent_at: null, attendee_name: 'Ayu', email: 'ayu@example.com', order_id: 'seat-order-1',
    };
    const operationRepo = { findOne: jest.fn().mockResolvedValue(operation), save: jest.fn(async (value) => value) };
    const groupRepo = { findOne: jest.fn().mockResolvedValue({ id: 'group-1', title: 'Gathering' }) };
    const occurrenceRepo = { findOne: jest.fn().mockResolvedValue({ price_per_seat: 25000, currency: 'IDR', payment_deadline: new Date('2026-10-20T00:00:00Z') }) };
    const registrationsRepo = { find: jest.fn().mockResolvedValue([registration]), save: jest.fn(async (value) => value) };
    const ordersRepo = { findOne: jest.fn().mockResolvedValue({ id: 'seat-order-1', website_id: 'site-1', transaction_id: 'transaction-1' }) };
    const websiteRepo = { findOne: jest.fn().mockResolvedValue({ id: 'site-1', name: 'Website', slug: 'website' }) };
    const repositoryMap = new Map<any, any>([
      [GatheringOperation, operationRepo],
      [WebsiteEventGroup, groupRepo],
      [GatheringOccurrence, occurrenceRepo],
      [WebsiteEventRegistration, registrationsRepo],
      [WebsiteOrder, ordersRepo],
      [Website, websiteRepo],
    ]);
    const dataSource = { getRepository: jest.fn((entity) => repositoryMap.get(entity)) };
    const messaging = {
      gatheringInvoiceTemplate: 'GatheringInvoice',
      sendEmail: jest.fn().mockResolvedValue(false),
    };
    const service = new GatheringOccurrenceService(dataSource as any, messaging as any);

    const result = await service.processInvoiceIssuance('operation-1');

    expect(result.status).toBe('FAILED');
    expect(result.failed_items).toEqual(['ayu@example.com']);
    expect(result.error_message).toMatch(/Messaging service rejected/);
    expect(registration.invoice_email_sent_at).toBeNull();
    expect(messaging.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      context: expect.objectContaining({ 'order-link': 'http://localhost:5005/website/order/transaction-1' }),
    }));
  });

  it('sends an OTP for an open RSVP but does not create an attendee before verification', async () => {
    process.env.RSVP_OTP_SECRET = process.env.RSVP_OTP_SECRET || 'gathering-test-otp-secret';
    const invitation = {
      id: 'invite-1', group_id: 'group-1', website_id: 'site-1', status: 'PENDING',
      use_count: 0, max_uses: 5, expires_at: new Date(Date.now() + 60_000), whatsapp: null,
    };
    const group = { id: 'group-1', website_id: 'site-1', title: 'Reuni', invite_policy: 'OPEN', workflow_step: 'INVITATION_CONFIRMATION', status: 'RSVP_OPEN' };
    const occurrence = {
      id: 'occurrence-1', parent_order_id: 'group-1', website_id: 'site-1', status: 'RSVP_OPEN',
      max_attendees: 5, opened_option_ids_snapshot: ['option-1'],
      option_groups_snapshot: [{ product_option_id: 'option-1', option_group_key: 'venue' }],
    };
    const invitationRepo = { findOne: jest.fn().mockResolvedValue(invitation) };
    const groups = { findOne: jest.fn().mockResolvedValue(group) };
    const occurrences = { findOne: jest.fn().mockResolvedValue(occurrence) };
    const registrations = { findOne: jest.fn().mockResolvedValue(null), count: jest.fn().mockResolvedValue(0), create: jest.fn(), save: jest.fn() };
    const challenge = { id: 'challenge-1', expires_at: new Date(Date.now() + 600_000), email: 'guest@example.com', reservation_data: { attendee_name: 'Guest' } };
    const challenges = {
      findOne: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ ...value, id: value.id ?? challenge.id })),
    };
    const websites = { findOne: jest.fn().mockResolvedValue({ id: 'site-1', name: 'Reuni Site' }) };
    const repositories = new Map<any, any>([
      [WebsiteEventInvitation, invitationRepo], [WebsiteEventGroup, groups],
      [GatheringOccurrence, occurrences], [WebsiteEventRegistration, registrations],
      [WebsiteEventRsvpChallenge, challenges], [Website, websites],
    ]);
    const manager = { getRepository: jest.fn((entity) => repositories.get(entity)) };
    const dataSource = {
      transaction: jest.fn((callback) => callback(manager)),
      getRepository: jest.fn((entity) => repositories.get(entity)),
    };
    const messagingService = { gatheringRsvpOtpTemplate: 'GatheringRsvpOtp', sendEmail: jest.fn().mockResolvedValue(true) };
    const service = new GatheringOccurrenceService(dataSource as any, messagingService as any);

    const result = await service.startPublicRsvpVerification('invite-1', {
      attendee_name: 'Guest', email: ' GUEST@example.com ', selected_options: { venue: 'option-1' },
    });

    expect(result.reservation_id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(result.reservation_id).toBe(challenges.save.mock.calls[0][0].id);
    expect(messagingService.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'guest@example.com', template: 'GatheringRsvpOtp',
      context: expect.objectContaining({ 'verification-code': expect.stringMatching(/^\d{6}$/) }),
    }));
    expect(registrations.save).not.toHaveBeenCalled();
    expect(challenges.save).toHaveBeenCalledWith(expect.objectContaining({
      status: 'PENDING', email: 'guest@example.com', code_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
    }));
  });

  it('increments failed OTP attempts and creates registration only after a valid code', async () => {
    const code = '183204';
    const otpSecret = process.env.RSVP_OTP_SECRET || process.env.CLIENT_APP_SECRET;
    if (!otpSecret) process.env.RSVP_OTP_SECRET = 'gathering-test-otp-secret';
    const secret = process.env.RSVP_OTP_SECRET || process.env.CLIENT_APP_SECRET || 'gathering-test-otp-secret';
    const challenge = {
      id: 'challenge-1', website_id: 'site-1', group_id: 'group-1', occurrence_id: 'occurrence-1', invitation_id: 'invite-1',
      email: 'guest@example.com', code_hash: createHmac('sha256', secret).update('challenge-1:183204').digest('hex'),
      reservation_data: { attendee_name: 'Guest', whatsapp: null, selected_options: { venue: 'option-1' } },
      status: 'PENDING', attempts: 0, expires_at: new Date(Date.now() + 600_000),
    };
    const invitation = { id: 'invite-1', status: 'PENDING', expires_at: new Date(Date.now() + 600_000), use_count: 0, max_uses: 5 };
    const occurrence = {
      id: 'occurrence-1', status: 'RSVP_OPEN', max_attendees: 5,
      opened_option_ids_snapshot: ['option-1'],
      option_groups_snapshot: [{ product_option_id: 'option-1', option_group_key: 'venue' }],
    };
    const challenges = { findOne: jest.fn().mockResolvedValue(challenge), save: jest.fn(async (value) => value) };
    const invitations = { findOne: jest.fn().mockResolvedValue(invitation), save: jest.fn(async (value) => value) };
    const occurrences = { findOne: jest.fn().mockResolvedValue(occurrence) };
    const registrations = {
      findOne: jest.fn().mockResolvedValue(null), count: jest.fn().mockResolvedValue(0),
      find: jest.fn().mockResolvedValue([{ selected_options: challenge.reservation_data.selected_options }]),
      create: jest.fn((value) => value), save: jest.fn(async (value) => ({ id: 'registration-1', ...value })),
    };
    const repositories = new Map<any, any>([
      [WebsiteEventRsvpChallenge, challenges], [WebsiteEventInvitation, invitations],
      [GatheringOccurrence, occurrences], [WebsiteEventRegistration, registrations],
    ]);
    const manager = { getRepository: jest.fn((entity) => repositories.get(entity)) };
    const service = new GatheringOccurrenceService({ transaction: jest.fn((callback) => callback(manager)) } as any);

    await expect(service.verifyPublicRsvpOtp('invite-1', { reservation_id: 'challenge-1', code: '000000' }))
      .rejects.toThrow(BadRequestException);
    expect(challenge.attempts).toBe(1);
    expect(registrations.save).not.toHaveBeenCalled();

    challenge.attempts = 0;
    const result = await service.verifyPublicRsvpOtp('invite-1', { reservation_id: 'challenge-1', code });
    expect(result).toEqual(expect.objectContaining({ id: 'registration-1', email: 'guest@example.com', registration_status: 'RSVP_CONFIRMED' }));
    expect(result.selected_options).toEqual({ venue: 'option-1' });
    expect(result.voting_results.venue).toEqual({ total_votes: 1, options: { 'option-1': { votes: 1, percentage: 100 } } });
    expect(challenge.status).toBe('VERIFIED');
    expect(invitation.use_count).toBe(1);
  });

  it('rejects unpaid RSVP registrations in a batch, reopens invitations, and emails each attendee', async () => {
    const registration = {
      id: 'registration-1', group_id: 'group-1', website_id: 'site-1', invitation_id: 'invite-1',
      attendee_name: 'Guest', email: 'guest@example.com', order_id: null, payment_status: 'UNPAID',
      registration_status: 'RSVP_CONFIRMED',
    };
    const group = { id: 'group-1', title: 'Reuni', workflow_step: 'INVITATION_CONFIRMATION', status: 'RSVP_OPEN' };
    const occurrence = { id: 'occurrence-1', status: 'RSVP_OPEN', rsvp_close_at: new Date(Date.now() + 60_000) };
    const invitation = { id: 'invite-1', group_id: 'group-1', use_count: 1, max_uses: 1, status: 'ACCEPTED' };
    const groups = { findOne: jest.fn().mockResolvedValue(group) };
    const occurrences = { findOne: jest.fn().mockResolvedValue(occurrence) };
    const registrations = {
      find: jest.fn().mockResolvedValue([registration]),
      save: jest.fn(async (value) => value),
    };
    const invitations = {
      findOne: jest.fn().mockResolvedValue(invitation),
      save: jest.fn(async (value) => value),
    };
    const websites = { findOne: jest.fn().mockResolvedValue({ name: 'Reuni Site' }) };
    const repositories = new Map<any, any>([
      [WebsiteEventGroup, groups], [GatheringOccurrence, occurrences],
      [WebsiteEventRegistration, registrations], [WebsiteEventInvitation, invitations],
      [Website, websites],
    ]);
    const manager = { getRepository: jest.fn((entity) => repositories.get(entity)) };
    const dataSource = { transaction: jest.fn((callback) => callback(manager)) };
    const messagingService = {
      gatheringRsvpRejectedTemplate: 'GatheringRsvpRejected',
      sendEmail: jest.fn().mockResolvedValue(true),
    };
    const service = new GatheringOccurrenceService(dataSource as any, messagingService as any);

    const result = await service.rejectRegistrations('group-1', 'site-1', 'user-1', {
      registration_ids: ['registration-1'],
      message: 'Kuota sudah penuh.',
    });

    expect(result).toEqual({ rejected_count: 1, email_failed_count: 0, failed_emails: [] });
    expect(registration).toEqual(expect.objectContaining({
      registration_status: 'REJECTED',
      rejection_message: 'Kuota sudah penuh.',
      rejected_at: expect.any(Date),
    }));
    expect(invitation).toEqual(expect.objectContaining({ use_count: 0, status: 'PENDING' }));
    expect(messagingService.sendEmail).toHaveBeenCalledWith({
      to: 'guest@example.com',
      template: 'GatheringRsvpRejected',
      context: {
        'attendee-name': 'Guest',
        'gathering-title': 'Reuni',
        'website-name': 'Reuni Site',
        'rejection-message': 'Kuota sudah penuh.',
      },
    });
  });
});
