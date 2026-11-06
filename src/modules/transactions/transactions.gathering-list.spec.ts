import { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';

import type {
  WebsiteOrderTermin,
  WebsiteTransaction,
  WebsiteTransactionFulfillmentLog,
} from '../../entities';
import { TransactionsService } from './transactions.service';

const gatheringListRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'group-1',
  kind: 'gathering',
  transaction_id: null,
  created_at: new Date('2026-10-01T00:00:00.000Z'),
  currency: 'IDR',
  status: 'PENDING_PAYMENT',
  total_amount: '300000',
  gathering: {
    group_id: 'group-1',
    occurrence_id: 'occurrence-1',
    title: 'Gathering Bandung',
    status: 'PAYMENT_OPEN',
    final_schedule: null,
    final_location: null,
    min_attendees: 2,
    max_attendees: 30,
    paid_count: 1,
    registered_count: 3,
    collected_amount: 100000,
    currency: 'IDR',
    initiator_name: null,
  },
  total_count: '1',
  ...overrides,
});

interface MockQueryBuilder extends Record<string, jest.Mock> {
  clone: jest.Mock;
  getRawOne: jest.Mock;
  getRawMany: jest.Mock;
  getCount: jest.Mock;
}

interface MockTransactionRepository {
  manager: { query: jest.Mock };
  createQueryBuilder: jest.Mock;
  find: jest.Mock;
}

function buildService(query: jest.Mock) {
  const makeQueryBuilder = (
    results: { rawOne?: unknown; rawMany?: unknown[]; count?: number } = {},
  ) => {
    const qb = {} as MockQueryBuilder;
    for (const method of ['select', 'addSelect', 'where', 'andWhere', 'innerJoin', 'groupBy']) {
      qb[method] = jest.fn().mockReturnValue(qb);
    }
    qb.clone = jest.fn().mockReturnValue(qb);
    qb.getRawOne = jest.fn().mockResolvedValue(results.rawOne);
    qb.getRawMany = jest.fn().mockResolvedValue(results.rawMany ?? []);
    qb.getCount = jest.fn().mockResolvedValue(results.count ?? 0);
    return qb;
  };
  const base = makeQueryBuilder({
    rawOne: {
      all_count: '2',
      awaiting_payment: '1',
      processing: '0',
      completed: '1',
      cancelled: '0',
    },
  });
  const needsAction = makeQueryBuilder({ count: 0 });
  const released = makeQueryBuilder({ count: 0 });
  base.clone
    .mockReturnValueOnce(
      makeQueryBuilder({
        rawOne: {
          all_count: '2',
          awaiting_payment: '1',
          processing: '0',
          completed: '1',
          cancelled: '0',
        },
      }),
    )
    .mockReturnValueOnce(needsAction)
    .mockReturnValueOnce(released);
  const held = makeQueryBuilder();
  const finalReleases = makeQueryBuilder();
  const transactionRepo: MockTransactionRepository = {
    manager: { query },
    createQueryBuilder: jest
      .fn()
      .mockReturnValueOnce(base)
      .mockReturnValueOnce(held)
      .mockReturnValueOnce(finalReleases),
    find: jest.fn().mockResolvedValue([]),
  };
  const fulfillmentLogs = {
    createQueryBuilder: jest.fn().mockReturnValue(makeQueryBuilder()),
  };
  const service = new TransactionsService(
    new ConfigService(),
    transactionRepo as unknown as Repository<WebsiteTransaction>,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    fulfillmentLogs as unknown as Repository<WebsiteTransactionFulfillmentLog>,
    { find: jest.fn().mockResolvedValue([]) } as unknown as Repository<WebsiteOrderTermin>,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  Object.defineProperty(service, 'buildFulfillmentMap', {
    configurable: true,
    value: jest.fn().mockResolvedValue({}),
  });
  return { service, transactionRepo };
}

describe('TransactionsService — tenant gathering list grouping', () => {
  it('hides participant-only checkout transactions and returns one row per occurrence/group', async () => {
    const query = jest.fn().mockResolvedValue([gatheringListRow()]);
    const { service } = buildService(query);

    const result = await service.listTenantTransactions('website-1', {});

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        id: 'group-1',
        kind: 'gathering',
        items: [],
        gathering: expect.objectContaining({
          group_id: 'group-1',
          occurrence_id: 'occurrence-1',
          registered_count: 3,
          paid_count: 1,
          collected_amount: 100000,
        }),
      }),
    );
    const [sql] = query.mock.calls[0];
    expect(sql).toContain("gather_order.metadata->'gathering'->>'role' = 'participant'");
    expect(sql).toContain('GROUP BY r.group_id, r.occurrence_id');
    expect(sql).toContain("'gathering'::text AS kind");
    expect(sql).toContain("'order'::text AS kind");
  });

  it('includes an occurrence with no registrations or transactions as a zero-amount plan row', async () => {
    const query = jest.fn().mockResolvedValue([
      gatheringListRow({
        status: 'PENDING_PAYMENT',
        total_amount: '0',
        gathering: {
          group_id: 'group-1',
          occurrence_id: 'occurrence-1',
          title: 'Planned gathering',
          status: 'PREORDER',
          final_schedule: null,
          final_location: null,
          min_attendees: 0,
          max_attendees: 10,
          paid_count: 0,
          registered_count: 0,
          collected_amount: 0,
          currency: 'IDR',
          initiator_name: null,
        },
      }),
    ]);
    const { service } = buildService(query);

    const result = await service.listTenantTransactions('website-1', { kind: 'gathering' });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].kind).toBe('gathering');
    expect(result.data[0].total_amount).toBe(0);
    expect(result.data[0].gathering).toEqual(
      expect.objectContaining({
        registered_count: 0,
        paid_count: 0,
        collected_amount: 0,
      }),
    );
    expect(query.mock.calls[0][0]).not.toContain("'order'::text AS kind");
  });

  it('marks regular transaction rows as orders and removes participant items from mixed checkouts', async () => {
    const query = jest.fn().mockResolvedValue([
      {
        id: 'transaction-1',
        kind: 'order',
        transaction_id: 'transaction-1',
        created_at: new Date('2026-10-01T00:00:00.000Z'),
        currency: 'IDR',
        status: 'HELD',
        total_amount: '50000',
        gathering: null,
        total_count: '1',
      },
    ]);
    const { service, transactionRepo } = buildService(query);
    transactionRepo.find.mockResolvedValue([
      {
        id: 'transaction-1',
        status: 'HELD',
        total_amount: 150000,
        items: [
          {
            order_id: 'regular-order',
            order: { id: 'regular-order', total_amount: 50000, metadata: null },
          },
          {
            order_id: 'gathering-order',
            order: {
              id: 'gathering-order',
              total_amount: 100000,
              metadata: {
                gathering: {
                  role: 'participant',
                  group_id: 'group-1',
                  occurrence_id: 'occurrence-1',
                },
              },
            },
          },
        ],
      },
    ]);

    const result = await service.listTenantTransactions('website-1', {});

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        id: 'transaction-1',
        kind: 'order',
        total_amount: 50000,
        items: [expect.objectContaining({ order_id: 'regular-order' })],
      }),
    );
  });

  it('applies kind, tab status, search, date range, and stable pagination before grouping results are paged', async () => {
    const query = jest.fn().mockResolvedValue([gatheringListRow({ total_count: '3' })]);
    const { service } = buildService(query);

    const result = await service.listTenantTransactions('website-1', {
      page: 2,
      size: 1,
      kind: 'gathering',
      status: 'PENDING_PAYMENT,HELD',
      search: 'Bandung',
      from: '2026-10-01',
      to: '2026-10-31',
    });

    expect(result.meta).toEqual({ page: 2, size: 1, total: 3, totalPages: 3 });
    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain('gr.status = ANY($2::text[])');
    expect(sql).toContain('gr.title ILIKE $3');
    expect(sql).toContain('gr.created_at >=');
    expect(sql).toContain('gr.created_at <');
    expect(sql).toContain('ORDER BY created_at DESC, kind ASC, id ASC');
    expect(sql).toContain('LIMIT $6 OFFSET $7');
    expect(sql).not.toContain("'order'::text AS kind");
    expect(parameters.slice(0, 3)).toEqual(['website-1', ['PENDING_PAYMENT', 'HELD'], '%Bandung%']);
    expect(parameters.slice(-2)).toEqual([1, 1]);
  });

  it('composes gathering kind with needs_action and applies occurrence lifecycle action rules', async () => {
    const query = jest.fn().mockResolvedValue([
      gatheringListRow({
        kind: 'gathering',
        status: 'HELD',
        needs_action: true,
        gathering: {
          group_id: 'group-1',
          occurrence_id: 'occurrence-1',
          title: 'Gathering Bandung',
          status: 'IN_PROGRESS',
          final_schedule: null,
          final_location: null,
          min_attendees: 2,
          max_attendees: 30,
          paid_count: 3,
          registered_count: 3,
          collected_amount: 300000,
          currency: 'IDR',
          initiator_name: null,
        },
      }),
    ]);
    const { service } = buildService(query);

    const result = await service.listTenantTransactions('website-1', {
      kind: 'gathering',
      needsAction: true,
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].needs_action).toBe(true);
    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain('gr.needs_action = TRUE');
    expect(sql).toContain("WHEN occ.status = 'PAYMENT_OPEN' THEN 'PENDING_PAYMENT'");
    expect(sql).toContain("WHEN occ.status IN ('CONFIRMED', 'IN_PROGRESS') THEN 'HELD'");
    expect(sql).toContain("WHEN occ.status = 'COMPLETED' THEN 'COMPLETED'");
    expect(sql).toContain("WHEN occ.status IN ('DRAFT', 'PREORDER', 'RSVP_OPEN') THEN 'PLANNED'");
    expect(sql).toContain("(occ.status = 'COMPLETED' AND COALESCE(settlement.outstanding, 0) > 0)");
    expect(parameters).toEqual(['website-1', 20, 0]);

    await service.listTenantTransactions('website-1', { needsAction: true });
    const [allKindsSql] = query.mock.calls[1];
    expect(allKindsSql).toContain('gr.needs_action = TRUE');
    expect(allKindsSql).toContain("t.status = 'DISPUTED'");
  });
});

describe('TransactionsService — gathering-aware summary tab counts', () => {
  it('counts each gathering group once alongside ordinary transaction rows', async () => {
    const query = jest.fn().mockResolvedValue([
      { status: 'PENDING_PAYMENT', row_count: '2', released_count: '1', needs_action_count: '0' },
      { status: 'HELD', row_count: '1', released_count: '0', needs_action_count: '1' },
      { status: 'PLANNED', row_count: '1', released_count: '0', needs_action_count: '0' },
    ]);
    const { service } = buildService(query);

    const summary = await service.getTenantTransactionSummary('website-1');

    expect(summary.counts).toEqual({
      all: 6,
      needsAction: 1,
      awaitingPayment: 3,
      processing: 1,
      completed: 1,
      cancelled: 0,
    });
    expect(summary.releasedThisMonthCount).toBe(1);
    expect(query.mock.calls[0][0]).toContain('GROUP BY gr.status');
    expect(query.mock.calls[0][0]).toContain("r.registration_status = 'RSVP_CONFIRMED'");
  });
});
