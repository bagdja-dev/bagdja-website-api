import { ConfigService } from '@nestjs/config';

import { TransactionsService } from './transactions.service';
import { EscrowClientService } from '../escrow/escrow-client.service';

/**
 * Direct pay + payee (payment-service direct-sale-payee-plan.md §4):
 * produk digital & Tagihan Termin lewat direct pay, dana diteruskan ke wallet
 * seller oleh payment-service, Termin ditandai PAID dari direct payment.
 */
function buildService(overrides: Record<string, unknown> = {}) {
  const service = new TransactionsService(
    new ConfigService(),
    {} as any, // transactionRepo
    {} as any, // itemRepo
    {} as any, // orderRepo
    {} as any, // productRepo
    {} as any, // websiteRepo
    {} as any, // flowRepo
    {} as any, // fulfillmentLogRepo
    {} as any, // terminRepo
    {} as any, // escrowClient
    {} as any, // shippingCalculation
    { notifyUser: jest.fn(), notifyWebsiteStaff: jest.fn() } as any,
    {} as any, // digitalDelivery
  ) as any;
  Object.assign(service, overrides);
  return service;
}

describe('TransactionsService — Tagihan Termin direct pay', () => {
  const terminTransaction = (status = 'PENDING_PAYMENT') => ({
    id: 'tx-termin-1',
    website_id: 'site-1',
    buyer_user_id: 'buyer-1',
    status,
    payment_mode: 'ADD_TO_CART',
    payment_request_id: 'payreq-termin-1',
    escrow_id: null,
    metadata: { termin_id: 'termin-1' },
    items: [],
  });

  it('createCheckout tidak menimpa mode ADD_TO_CART order Termin untuk produk non-digital', async () => {
    const terminOrder = {
      id: 'order-termin-1',
      website_id: 'site-1',
      status: 'PENDING',
      transaction_id: 'tx-existing',
      payment_mode: 'ADD_TO_CART',
      product: { type: 'physical' },
      metadata: { termin_id: 'termin-1' },
    };
    const orderRepo = { find: jest.fn().mockResolvedValue([terminOrder]), save: jest.fn() };
    const service = buildService({ orderRepo });

    // Berhenti di guard "already in a transaction" — setelah langkah override mode.
    await expect(
      service.createCheckout({ userId: 'buyer-1' }, { order_ids: ['order-termin-1'] }),
    ).rejects.toThrow('already in a transaction');
    expect(terminOrder.payment_mode).toBe('ADD_TO_CART');
    expect(orderRepo.save).not.toHaveBeenCalled();
  });

  it('createCheckout tetap mengoreksi order non-Termin produk fisik ke ESCROW', async () => {
    const order = {
      id: 'order-1',
      website_id: 'site-1',
      status: 'PENDING',
      transaction_id: 'tx-existing',
      payment_mode: 'ADD_TO_CART',
      product: { type: 'physical' },
      metadata: {},
    };
    const orderRepo = { find: jest.fn().mockResolvedValue([order]), save: jest.fn() };
    const service = buildService({ orderRepo });

    await expect(
      service.createCheckout({ userId: 'buyer-1' }, { order_ids: ['order-1'] }),
    ).rejects.toThrow('already in a transaction');
    expect(order.payment_mode).toBe('ESCROW');
    expect(orderRepo.save).toHaveBeenCalledWith(order);
  });

  it('syncTransaction menandai transaksi COMPLETED dan Termin PAID saat direct payment lunas', async () => {
    const transaction = terminTransaction();
    const termin = { id: 'termin-1', status: 'ISSUED', transaction_id: null };
    const terminRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(termin),
      save: jest.fn(async (value) => value),
    };
    const service = buildService({
      terminRepo,
      transactionRepo: {
        findOne: jest.fn().mockResolvedValue(transaction),
        save: jest.fn(async (value) => value),
      },
      escrowClient: {
        getDirectPaymentStatus: jest.fn().mockResolvedValue({ status: 'PAID', paidAt: null }),
        getEscrow: jest.fn(),
        release: jest.fn(),
      },
      digitalDelivery: { sendPaidTransactionAssets: jest.fn().mockResolvedValue([]) },
    });

    const result = await service.syncTransaction('tx-termin-1', 'buyer-1', 'site-1');

    expect(result.status).toBe('COMPLETED');
    expect(termin).toEqual({ id: 'termin-1', status: 'PAID', transaction_id: 'tx-termin-1' });
    // Tidak ada escrow untuk dirilis — dana sudah diteruskan payment-service.
    expect(service.escrowClient.getEscrow).not.toHaveBeenCalled();
    expect(service.escrowClient.release).not.toHaveBeenCalled();
  });

  it('tidak menulis ulang Termin yang sudah PAID', async () => {
    const terminRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'termin-1', status: 'PAID', transaction_id: 'tx-termin-1' }),
      save: jest.fn(),
    };
    const service = buildService({
      terminRepo,
      transactionRepo: { save: jest.fn(async (value) => value) },
    });

    await service.completeDirectPayment(terminTransaction());

    expect(terminRepo.save).not.toHaveBeenCalled();
  });

  it('detail transaksi induk mem-poll direct payment transaksi Termin', async () => {
    const transaction = terminTransaction();
    const termin = { id: 'termin-1', status: 'ISSUED', transaction_id: 'tx-termin-1' };
    const service = buildService({
      terminRepo: {
        find: jest.fn().mockResolvedValue([termin]),
        findOne: jest.fn().mockResolvedValue(termin),
        save: jest.fn(async (value) => value),
      },
      transactionRepo: {
        find: jest.fn().mockResolvedValue([transaction]),
        save: jest.fn(async (value) => value),
      },
      escrowClient: {
        getDirectPaymentStatus: jest.fn().mockResolvedValue({ status: 'PAID', paidAt: null }),
        getEscrow: jest.fn(),
      },
    });

    await service.syncTerminTransactionsForOrders(['order-1']);

    expect(service.escrowClient.getDirectPaymentStatus).toHaveBeenCalledWith('payreq-termin-1');
    expect(service.escrowClient.getEscrow).not.toHaveBeenCalled();
    expect(transaction.status).toBe('COMPLETED');
    expect(termin.status).toBe('PAID');
  });
});

describe('EscrowClientService.initializeWebsiteDirectPayment', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('mengirim wallet owner website sebagai payeeWalletId', async () => {
    const config = new ConfigService({
      BAGDJA_PAYMENT_API: 'http://pay.test',
      CLIENT_APP_ID: 'bagdja-website',
      CLIENT_APP_SECRET: 'secret',
    });
    const logger = { init: jest.fn(), bagdjaLog: jest.fn() };
    const client = new EscrowClientService(config, logger as any, {} as any, {} as any) as any;
    client.ensureDirectPaymentProductForWebsite = jest.fn().mockResolvedValue('product-direct-1');
    client.resolveSellerWallet = jest.fn().mockResolvedValue({ walletId: 'wallet-seller', userId: 'seller-1' });
    client.getAuthToken = jest.fn().mockResolvedValue('token');
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ paymentRequestId: 'payreq-1', checkoutUrl: 'http://pay.test/c', refNumber: 'INV-1' }),
    });
    global.fetch = fetchMock as any;

    await client.initializeWebsiteDirectPayment({
      websiteId: 'site-1',
      transactionId: 'tx-1',
      buyerUserId: 'buyer-1',
      amount: 150000,
      currency: 'IDR',
      successRedirectUrl: 'http://site/ok',
      failureRedirectUrl: 'http://site/fail',
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://pay.test/payments/initialize');
    expect(JSON.parse(init.body)).toEqual(expect.objectContaining({
      itemType: 'PRODUCT',
      itemId: 'product-direct-1',
      amount: 150000,
      payeeWalletId: 'wallet-seller',
      metadata: expect.objectContaining({ seller_user_id: 'seller-1' }),
    }));
  });
});
