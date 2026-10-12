import { NotFoundException } from '@nestjs/common';
import { In, Not } from 'typeorm';

import { GatheringOccurrence } from '../../entities/gathering-occurrence.entity';
import { WebsiteEventGroup } from '../../entities/website-event-group.entity';
import { WebsiteEventProductOption } from '../../entities/website-event-product-option.entity';
import { WebsiteOrder } from '../../entities/website-order.entity';
import { WebsiteProduct } from '../../entities/website-product.entity';

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
    currency: 'IDR',
    min_attendees: 5,
    max_attendees: 30,
    availability_window: {},
    venue_location: 'Bandung',
    benefits: [],
    cancellation_policy: { version: 1, penalty_type: 'NONE', penalty_value: 0 },
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
    const products = { findOne: jest.fn().mockResolvedValue(productFound ? product : null) };
    const productOptions = { find: jest.fn().mockResolvedValue(options) };
    const repositoryMap = new Map<any, any>([
      [WebsiteProduct, products],
      [WebsiteEventProductOption, productOptions],
      [WebsiteEventGroup, groups],
      [GatheringOccurrence, occurrences],
      [WebsiteOrder, orders],
    ]);
    const manager = { getRepository: jest.fn((entity) => repositoryMap.get(entity)) };
    const dataSource = {
      transaction: jest.fn((callback) => callback(manager)),
      getRepository: jest.fn((entity) => repositoryMap.get(entity)),
    };
    return { service: new GatheringOccurrenceService(dataSource as any), dataSource, groups, occurrences, products, orders };
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

  it('lists open (not cancelled/completed) plans scoped to the current website and initiator', async () => {
    const groups = [{ id: 'group-1', website_id: 'site-1', initiator_user_id: 'user-1', status: 'PREORDER' }];
    const occurrences = [{ id: 'occurrence-1', parent_order_id: 'group-1', website_id: 'site-1', initiator_user_id: 'user-1' }];
    const { service, dataSource } = buildService();
    const groupRepo = dataSource.getRepository(WebsiteEventGroup) as any;
    const occurrenceRepo = dataSource.getRepository(GatheringOccurrence) as any;
    groupRepo.find.mockResolvedValue(groups);
    occurrenceRepo.find.mockResolvedValue(occurrences);

    const result = await service.listPlansForInitiator('site-1', 'user-1');

    expect(groupRepo.find).toHaveBeenCalledWith({
      where: { website_id: 'site-1', initiator_user_id: 'user-1', status: Not(In(['CANCELLED', 'COMPLETED'])) },
      order: { created_at: 'DESC' },
    });
    expect(occurrenceRepo.find).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ website_id: 'site-1', initiator_user_id: 'user-1' }),
    }));
    expect(result).toEqual([{ ...groups[0], occurrence: occurrences[0] }]);
  });

  it('updates plan metadata only for its initiator while still in PREORDER', async () => {
    const group = {
      id: 'group-1',
      website_id: 'site-1',
      initiator_user_id: 'user-1',
      status: 'PREORDER',
      title: 'Rencana lama',
      invite_policy: 'OPEN',
    };
    const { service, groups } = buildService({ existingGroup: group });

    const result = await service.updatePlanForInitiator('group-1', 'site-1', 'user-1', {
      title: '  Reuni Bandung  ',
      invite_policy: 'INVITE_ONLY',
    });

    expect(groups.save).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Reuni Bandung',
      invite_policy: 'INVITE_ONLY',
    }));
    expect(result.occurrence.id).toBe('occurrence-1');
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
});
