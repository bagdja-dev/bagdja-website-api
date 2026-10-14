import { ConfigService } from '@nestjs/config';

import { TransactionsService } from './transactions.service';

const PAID_ORDER_TRANSACTION_STATUSES = ['HELD', 'COMPLETED', 'DISPUTED'];

function buildService(terminRepo: any) {
  return new TransactionsService(
    new ConfigService(),
    {} as any, // transactionRepo
    {} as any, // itemRepo
    {} as any, // orderRepo
    {} as any, // productRepo
    {} as any, // websiteRepo
    {} as any, // flowRepo
    {} as any, // fulfillmentLogRepo
    terminRepo,
    {} as any, // escrowClient
    {} as any, // shippingCalculation
    { notifyUser: jest.fn(), notifyWebsiteStaff: jest.fn() } as any,
    {} as any, // digitalDelivery
  );
}

function buildQueryBuilderMock(rows: unknown[], total: number) {
  const qb: any = {
    innerJoinAndSelect: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([rows, total]),
    getCount: jest.fn().mockResolvedValue(total),
  };
  return qb;
}

const terminRow = {
  id: 'termin-1',
  sequence: 2,
  label: 'Pelunasan',
  amount: '250000',
  status: 'SCHEDULED',
  anchor_step_name: 'Pemasangan',
  source_order_id: 'order-1',
  transaction_id: null,
  created_at: new Date('2026-09-01'),
  issued_at: null,
  source_order: {
    transaction_id: 'tx-original-1',
    buyer_identifier: 'buyer@example.com',
    product: { name: 'Kanopi Custom' },
  },
};

describe('TransactionsService — Invoice (list/count Termin lintas-order)', () => {
  it('adds attendee name and invoice number to each gathering seat transaction item', async () => {
    const transaction = {
      id: 'transaction-1',
      buyer_user_id: 'buyer-1',
      status: 'COMPLETED',
      payment_mode: 'ESCROW',
      items: [{
        id: 'item-1',
        order_id: 'seat-order-1',
        order: {
          metadata: {
            gathering: { role: 'participant', group_id: 'group-1', occurrence_id: 'occurrence-1' },
            registration_id: '12345678-1234-1234-1234-123456789abc',
          },
        },
      }],
    };
    const registrations = {
      find: jest.fn().mockResolvedValue([{
        id: '12345678-1234-1234-1234-123456789abc',
        attendee_name: 'Nandang Hermawan',
        payment_status: 'PAID',
      }]),
    };
    const service = buildService({ findOne: jest.fn() }) as any;
    service.transactionRepo = {
      findOne: jest.fn().mockResolvedValue(transaction),
      manager: { getRepository: jest.fn().mockReturnValue(registrations) },
    };
    service.syncTerminTransactionsForOrders = jest.fn();
    service.buildFulfillmentMap = jest.fn().mockResolvedValue({});

    const result = await service.getTransaction('transaction-1', 'buyer-1');

    expect(registrations.find).toHaveBeenCalledTimes(1);
    expect(registrations.find.mock.calls[0][0].select).toEqual({ id: true, attendee_name: true, payment_status: true });
    expect(registrations.find.mock.calls[0][0].where.id._value).toEqual(['12345678-1234-1234-1234-123456789abc']);
    expect(result.items?.[0].order).toEqual(expect.objectContaining({
      gathering_invoice: {
        registration_id: '12345678-1234-1234-1234-123456789abc',
        invoice_id: 'GTH-12345678',
        attendee_name: 'Nandang Hermawan',
        payment_status: 'PAID',
      },
    }));
  });

  it('refreshes escrow checkout even when the stored URL is present because its Pay UI session may have expired', async () => {
    const service = buildService({}) as any;
    const transaction = {
      id: 'transaction-1',
      buyer_user_id: 'buyer-1',
      status: 'PENDING_PAYMENT',
      payment_mode: 'ESCROW',
      checkout_url: 'https://pay.example/checkout?t=expired',
    };
    const refreshed = { ...transaction, checkout_url: 'https://pay.example/checkout?t=fresh' };
    const runCheckoutPayment = jest.fn().mockResolvedValue(refreshed);
    service.transactionRepo = { findOne: jest.fn().mockResolvedValue(transaction) };
    service.runCheckoutPayment = runCheckoutPayment;

    await expect(service.retryCheckout('transaction-1', { userId: 'buyer-1' }, 'http://localhost:5005'))
      .resolves.toBe(refreshed);

    expect(runCheckoutPayment).toHaveBeenCalledWith(
      { userId: 'buyer-1' },
      transaction,
      undefined,
      'http://localhost:5005',
      undefined,
    );
  });

  it('listWebsiteTermins: scope by website_id, hanya order yang DP-nya sudah dibayar (HELD/COMPLETED/DISPUTED), map orderTransactionId dari source_order', async () => {
    const qb = buildQueryBuilderMock([terminRow], 1);
    const terminRepo = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
    const service = buildService(terminRepo);

    const result = await service.listWebsiteTermins('site-1', { status: 'SCHEDULED,ISSUED' });

    expect(qb.where).toHaveBeenCalledWith('termin.website_id = :websiteId', { websiteId: 'site-1' });
    expect(qb.andWhere).toHaveBeenCalledWith('source_tx.status IN (:...paidStatuses)', {
      paidStatuses: PAID_ORDER_TRANSACTION_STATUSES,
    });
    expect(qb.andWhere).toHaveBeenCalledWith('termin.status IN (:...statuses)', {
      statuses: ['SCHEDULED', 'ISSUED'],
    });
    expect(result.data).toEqual([
      expect.objectContaining({
        id: 'termin-1',
        amount: 250000,
        orderTransactionId: 'tx-original-1',
        productName: 'Kanopi Custom',
        buyerIdentifier: 'buyer@example.com',
      }),
    ]);
    expect(result.meta).toEqual({ page: 1, size: 20, total: 1, totalPages: 1 });
  });

  it('countWebsiteTermins: filter website_id + status DP terbayar sama seperti listWebsiteTermins', async () => {
    const qb = buildQueryBuilderMock([], 3);
    const terminRepo = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
    const service = buildService(terminRepo);

    const count = await service.countWebsiteTermins('site-1', 'SCHEDULED');

    expect(qb.where).toHaveBeenCalledWith('termin.website_id = :websiteId', { websiteId: 'site-1' });
    expect(qb.andWhere).toHaveBeenCalledWith('source_tx.status IN (:...paidStatuses)', {
      paidStatuses: PAID_ORDER_TRANSACTION_STATUSES,
    });
    expect(count).toBe(3);
  });

  it('listBuyerTermins: filter lewat join ke source_order.buyer_user_id + DP sudah dibayar, tidak expose buyerIdentifier', async () => {
    const qb = buildQueryBuilderMock([terminRow], 1);
    const terminRepo = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
    const service = buildService(terminRepo);

    const result = await service.listBuyerTermins('buyer-1', {});

    expect(qb.where).toHaveBeenCalledWith('source_order.buyer_user_id = :buyerUserId', {
      buyerUserId: 'buyer-1',
    });
    expect(qb.andWhere).toHaveBeenCalledWith('source_tx.status IN (:...paidStatuses)', {
      paidStatuses: PAID_ORDER_TRANSACTION_STATUSES,
    });
    expect(result.data[0].buyerIdentifier).toBeNull();
    expect(result.data[0].orderTransactionId).toBe('tx-original-1');
  });

  it('countBuyerTermins: getCount lewat query builder yang sama, filter status opsional + DP sudah dibayar', async () => {
    const qb = buildQueryBuilderMock([], 5);
    const terminRepo = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
    const service = buildService(terminRepo);

    const count = await service.countBuyerTermins('buyer-1', 'ISSUED');

    expect(qb.andWhere).toHaveBeenCalledWith('source_tx.status IN (:...paidStatuses)', {
      paidStatuses: PAID_ORDER_TRANSACTION_STATUSES,
    });
    expect(qb.andWhere).toHaveBeenCalledWith('termin.status IN (:...statuses)', { statuses: ['ISSUED'] });
    expect(count).toBe(5);
  });
});
