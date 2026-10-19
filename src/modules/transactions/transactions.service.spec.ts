import { ConfigService } from '@nestjs/config';
import { In } from 'typeorm';
import { BadRequestException } from '@nestjs/common';

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

    const result = await service.getTransaction('transaction-1', 'buyer-1', 'site-1');

    expect(registrations.find).toHaveBeenCalledTimes(1);
    expect(registrations.find.mock.calls[0][0].select).toEqual({ id: true, attendee_name: true, payment_status: true });
    expect(registrations.find.mock.calls[0][0].where.id._value).toEqual(['12345678-1234-1234-1234-123456789abc']);
    expect(service.transactionRepo.findOne).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'transaction-1', website_id: 'site-1', buyer_user_id: 'buyer-1' },
    }));
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

describe('TransactionsService — buyer transaction tenant scope', () => {
  it('always scopes buyer transaction lists to one website', async () => {
    const qb = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(0),
      getMany: jest.fn().mockResolvedValue([]),
    };
    const service = buildService({}) as any;
    service.transactionRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      find: jest.fn(),
    };

    const result = await service.listTransactions('buyer-1', { websiteId: 'site-1' });

    expect(qb.where).toHaveBeenCalledWith('t.buyer_user_id = :buyerUserId', { buyerUserId: 'buyer-1' });
    expect(qb.andWhere).toHaveBeenCalledWith('t.website_id = :websiteId', { websiteId: 'site-1' });
    expect(result.data).toEqual([]);
  });
});

describe('TransactionsService — sinkron payment_status seat gathering', () => {
  it('cancelTransaction mengembalikan registration seat yang PENDING_PAYMENT ke UNPAID', async () => {
    const transaction = { id: 'tx-1', buyer_user_id: 'participant-1', status: 'PENDING_PAYMENT', payment_mode: 'ESCROW', escrow_id: 'escrow-1' };
    const registrationRepo = { update: jest.fn().mockResolvedValue({ affected: 1 }) };
    const transactionRepo = {
      findOne: jest.fn().mockResolvedValue(transaction),
      save: jest.fn(async (value) => value),
      manager: { getRepository: jest.fn(() => registrationRepo) },
    };
    const itemRepo = { find: jest.fn().mockResolvedValue([{ order_id: 'seat-order-1' }, { order_id: 'other-order-1' }]) };
    const orderRepo = {
      update: jest.fn().mockResolvedValue({ affected: 2 }),
      find: jest.fn().mockResolvedValue([
        { id: 'seat-order-1', metadata: { source: 'gathering_seat', registration_id: 'registration-1', gathering: { role: 'participant', group_id: 'group-1', occurrence_id: 'occurrence-1' } } },
        { id: 'other-order-1', metadata: null },
      ]),
    };
    const escrowClient = { getEscrow: jest.fn().mockResolvedValue({ status: 'PENDING' }) };
    const service = new TransactionsService(
      new ConfigService(),
      transactionRepo as any,
      itemRepo as any,
      orderRepo as any,
      {} as any, {} as any, {} as any, {} as any, {} as any,
      escrowClient as any,
      {} as any,
      { notifyUser: jest.fn(), notifyWebsiteStaff: jest.fn() } as any,
      {} as any,
    );

    const result = await service.cancelTransaction('tx-1', { userId: 'participant-1' } as any);

    expect(result.status).toBe('CANCELLED');
    expect(registrationRepo.update).toHaveBeenCalledTimes(1);
    const [criteria, values] = registrationRepo.update.mock.calls[0];
    expect(criteria.payment_status).toBe('PENDING_PAYMENT');
    expect(criteria.id.value).toEqual(['registration-1']);
    expect(values).toEqual({ payment_status: 'UNPAID' });
  });
});

describe('TransactionsService — detail vs sync transaksi buyer', () => {
  function digitalTransaction(status: string) {
    return {
      id: 'tx-digital-1',
      website_id: 'site-1',
      buyer_user_id: 'buyer-1',
      status,
      payment_mode: 'ADD_TO_CART',
      payment_request_id: 'payreq-1',
      escrow_id: null,
      metadata: {},
      items: [{ id: 'item-1', order_id: 'order-1', order: { id: 'order-1', product: { type: 'digital' }, metadata: {} } }],
    };
  }

  it('getTransaction tidak memanggil layanan eksternal walau transaksi digital masih PENDING_PAYMENT', async () => {
    const service = buildService({ findOne: jest.fn() }) as any;
    const getDirectPaymentStatus = jest.fn();
    const sendPaidTransactionAssets = jest.fn();
    service.escrowClient = { getDirectPaymentStatus, getEscrow: jest.fn() };
    service.digitalDelivery = { sendPaidTransactionAssets, listTransactionAssets: jest.fn().mockResolvedValue([]) };
    service.transactionRepo = { findOne: jest.fn().mockResolvedValue(digitalTransaction('PENDING_PAYMENT')) };
    service.buildFulfillmentMap = jest.fn().mockResolvedValue({});

    const result = await service.getTransaction('tx-digital-1', 'buyer-1', 'site-1');

    expect(result.status).toBe('PENDING_PAYMENT');
    expect(getDirectPaymentStatus).not.toHaveBeenCalled();
    expect(sendPaidTransactionAssets).not.toHaveBeenCalled();
  });

  it('syncTransaction tidak melempar error saat payment-service gagal, melaporkan langkah yang gagal', async () => {
    const service = buildService({ find: jest.fn().mockResolvedValue([]) }) as any;
    const transaction = digitalTransaction('PENDING_PAYMENT');
    service.escrowClient = { getDirectPaymentStatus: jest.fn().mockRejectedValue(new Error('payment request not found')) };
    service.digitalDelivery = { sendPaidTransactionAssets: jest.fn() };
    service.transactionRepo = { findOne: jest.fn().mockResolvedValue(transaction), save: jest.fn() };

    await expect(service.syncTransaction('tx-digital-1', 'buyer-1', 'site-1')).resolves.toEqual({
      id: 'tx-digital-1',
      status: 'PENDING_PAYMENT',
      synced: false,
      sync_errors: ['direct_payment'],
    });
    expect(service.digitalDelivery.sendPaidTransactionAssets).not.toHaveBeenCalled();
  });

  it('syncTransaction menandai COMPLETED lalu mengirim aset digital saat pembayaran langsung sudah PAID', async () => {
    const service = buildService({ find: jest.fn().mockResolvedValue([]) }) as any;
    const transaction = digitalTransaction('PENDING_PAYMENT');
    service.escrowClient = { getDirectPaymentStatus: jest.fn().mockResolvedValue({ status: 'PAID', paidAt: null }) };
    service.digitalDelivery = { sendPaidTransactionAssets: jest.fn().mockResolvedValue([]) };
    service.transactionRepo = { findOne: jest.fn().mockResolvedValue(transaction), save: jest.fn() };

    const result = await service.syncTransaction('tx-digital-1', 'buyer-1', 'site-1');

    expect(result).toEqual({ id: 'tx-digital-1', status: 'COMPLETED', synced: true, sync_errors: [] });
    expect(service.digitalDelivery.sendPaidTransactionAssets).toHaveBeenCalledWith(transaction);
    expect(service.transactionRepo.findOne).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'tx-digital-1', website_id: 'site-1', buyer_user_id: 'buyer-1' },
    }));
  });

  it('syncTransaction 404 untuk transaksi milik buyer lain (anti-leak)', async () => {
    const service = buildService({}) as any;
    service.transactionRepo = { findOne: jest.fn().mockResolvedValue(null) };

    await expect(service.syncTransaction('tx-digital-1', 'buyer-2', 'site-1')).rejects.toThrow('Transaction not found');
  });
});

describe('TransactionsService — batalkan direct payment (ADD_TO_CART)', () => {
  function setup(payment: { status: string; paymentStarted: boolean; paidAt: string | null }) {
    const service = buildService({}) as any;
    const transaction = {
      id: 'transaction-1',
      buyer_user_id: 'buyer-1',
      status: 'PENDING_PAYMENT',
      payment_mode: 'ADD_TO_CART',
      payment_request_id: 'payment-request-1',
      escrow_id: null,
    };
    service.transactionRepo = {
      findOne: jest.fn().mockResolvedValue(transaction),
      save: jest.fn(async (value) => value),
    };
    service.itemRepo = { find: jest.fn().mockResolvedValue([]) };
    service.escrowClient = {
      getDirectPaymentStatus: jest.fn().mockResolvedValue(payment),
      cancelPendingDirectPayment: jest.fn().mockResolvedValue({ ...payment, status: 'CANCELLED' }),
    };
    return { service, transaction };
  }

  it('membatalkan payment request yang belum dimulai lalu transaksi jadi CANCELLED', async () => {
    const { service, transaction } = setup({ status: 'PENDING', paymentStarted: false, paidAt: null });

    await expect(service.cancelTransaction('transaction-1', { userId: 'buyer-1' })).resolves.toBe(transaction);

    expect(service.escrowClient.cancelPendingDirectPayment).toHaveBeenCalledWith(
      'payment-request-1',
      'website-transaction-cancel:transaction-1',
    );
    expect(transaction.status).toBe('CANCELLED');
  });

  it('menolak cancel kalau buyer sudah memulai pembayaran di provider', async () => {
    const { service, transaction } = setup({ status: 'PENDING', paymentStarted: true, paidAt: null });

    await expect(service.cancelTransaction('transaction-1', { userId: 'buyer-1' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(service.escrowClient.cancelPendingDirectPayment).not.toHaveBeenCalled();
    expect(transaction.status).toBe('PENDING_PAYMENT');
  });

  it('menyinkron ke COMPLETED dan menolak cancel kalau sudah PAID', async () => {
    const { service, transaction } = setup({ status: 'PAID', paymentStarted: true, paidAt: '2026-10-17T03:00:00.000Z' });

    await expect(service.cancelTransaction('transaction-1', { userId: 'buyer-1' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(transaction.status).toBe('COMPLETED');
  });

  it('langsung cancel kalau payment request sudah EXPIRED', async () => {
    const { service, transaction } = setup({ status: 'EXPIRED', paymentStarted: true, paidAt: null });

    await service.cancelTransaction('transaction-1', { userId: 'buyer-1' });

    expect(service.escrowClient.cancelPendingDirectPayment).not.toHaveBeenCalled();
    expect(transaction.status).toBe('CANCELLED');
  });
});

describe('TransactionsService — seat gathering lunas tersimpan PAID', () => {
  it('menyimpan PAID ke registration seat saat escrow berubah ke HELD', async () => {
    const service = buildService({}) as any;
    const transaction = { id: 'transaction-1', escrow_id: 'escrow-1', status: 'PENDING_PAYMENT', held_at: null };
    const registrationRepo = { update: jest.fn() };
    service.transactionRepo = {
      save: jest.fn(async (value) => value),
      manager: { getRepository: jest.fn(() => registrationRepo) },
    };
    service.itemRepo = {
      find: jest.fn().mockResolvedValue([
        { order: { id: 'seat-order-1', metadata: { gathering: { role: 'participant', group_id: 'group-1', occurrence_id: 'occurrence-1' }, registration_id: 'registration-1' } } },
      ]),
    };
    service.escrowClient = { getEscrow: jest.fn().mockResolvedValue({ id: 'escrow-1', status: 'HELD' }) };
    service.maybeAutoReleaseTermin = jest.fn();

    await service.syncStatusFromEscrow(transaction);

    expect(transaction.status).toBe('HELD');
    expect(registrationRepo.update).toHaveBeenCalledWith(
      { id: In(['registration-1']), payment_status: In(['UNPAID', 'PENDING_PAYMENT']) },
      { payment_status: 'PAID' },
    );
  });
});
