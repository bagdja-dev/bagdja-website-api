import { ConfigService } from '@nestjs/config';
import { IsNull } from 'typeorm';

import { OrdersService } from './orders.service';

describe('OrdersService', () => {
  function buildDraftService({ existing }: { existing: any }) {
    const orderRepo = {
      findOne: jest.fn().mockResolvedValue(existing),
      save: jest.fn(async (value) => value),
      create: jest.fn((value) => value),
    };
    const productRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'product-1',
        website_id: 'site-1',
        is_active: true,
        price: 100,
        quotable: true,
        payment_meta: [{ payment_mode: 'ADD_TO_CART' }],
      }),
    };
    const productLocationRepo = { find: jest.fn().mockResolvedValue([]) };
    const service = new OrdersService(
      new ConfigService(),
      orderRepo as any,
      productRepo as any,
      {} as any,
      productLocationRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    return { service, orderRepo };
  }

  it('allows detail-page quantity additions before quotation is locked', async () => {
    const existing = {
      quantity: 2,
      total_amount: 200,
      unit_price: 100,
      metadata: {},
      quoted_total_amount: null,
    };
    const { service, orderRepo } = buildDraftService({ existing });

    await service.createDraftOrder(
      { userId: 'buyer-1', email: 'buyer@example.com' } as any,
      { website_id: 'site-1', product_id: 'product-1', quantity: 3 },
    );

    expect(existing.quantity).toBe(5);
    expect(existing.total_amount).toBe(500);
    expect(orderRepo.save).toHaveBeenCalledWith(existing);
  });

  it('creates a new draft when a quotable product already has a quoted draft', async () => {
    const existing = {
      quantity: 2,
      total_amount: 200,
      unit_price: 100,
      metadata: { preorder: true },
      quoted_total_amount: 500,
    };
    const { service, orderRepo } = buildDraftService({ existing });

    const result = await service.createDraftOrder(
      { userId: 'buyer-1', email: 'buyer@example.com' } as any,
      { website_id: 'site-1', product_id: 'product-1', quantity: 1 },
    );

    expect(orderRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        quantity: 1,
        metadata: { source: 'add_to_cart' },
      }),
    );
    expect(result).not.toBe(existing);
  });

  it('records a quotation revision in fulfillment logs when a draft quote is set', async () => {
    const orderRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'order-1',
        website_id: 'site-1',
        status: 'PENDING',
        transaction_id: null,
        unit_price: 0,
        total_amount: 0,
        quantity: 2,
        metadata: {},
      }),
      save: jest.fn(async (value) => value),
    };
    const terminRepo = {
      delete: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockResolvedValue(undefined),
      create: jest.fn((value) => value),
    };
    const fulfillmentLogRepo = {
      create: jest.fn((value) => value),
      save: jest.fn().mockResolvedValue(undefined),
    };

    const service = new OrdersService(
      new ConfigService(),
      orderRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      terminRepo as any,
      {} as any,
      fulfillmentLogRepo as any,
      {} as any,
    );

    await service.setDraftQuote('site-1', 'order-1', 150000, [{ label: 'DP', amount: 150000 }]);

    expect(fulfillmentLogRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        order_id: 'order-1',
        event_type: 'QUOTE_SET',
        form_data: expect.objectContaining({
          final_price: 150000,
        }),
      }),
    );
    expect(fulfillmentLogRepo.save).toHaveBeenCalledTimes(1);
  });

  it('countDraftOrdersAwaitingQuotation: hanya hitung draft PENDING tanpa transaksi & belum di-quote', async () => {
    const orderRepo = { count: jest.fn().mockResolvedValue(4) };
    const service = new OrdersService(
      new ConfigService(),
      orderRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const count = await service.countDraftOrdersAwaitingQuotation('site-1');

    expect(orderRepo.count).toHaveBeenCalledWith({
      where: {
        website_id: 'site-1',
        status: 'PENDING',
        transaction_id: IsNull(),
        quoted_total_amount: IsNull(),
      },
    });
    expect(count).toBe(4);
  });

  it('cancelDraftAsAdmin: set status CANCELLED + metadata cancelled_by admin', async () => {
    const orderRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'order-1',
        website_id: 'site-1',
        status: 'PENDING',
        transaction_id: null,
        metadata: { foo: 'bar' },
      }),
      save: jest.fn(async (value) => value),
    };
    const service = new OrdersService(
      new ConfigService(),
      orderRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const result = await service.cancelDraftAsAdmin('site-1', 'order-1', 'Buyer tidak merespons');

    expect(orderRepo.findOne).toHaveBeenCalledWith({ where: { id: 'order-1', website_id: 'site-1' } });
    expect(orderRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'CANCELLED',
        metadata: expect.objectContaining({
          foo: 'bar',
          cancelled_by: 'admin',
          cancellation_reason: 'Buyer tidak merespons',
        }),
      }),
    );
    expect(result.status).toBe('CANCELLED');
  });

  it('cancelDraftAsAdmin: tolak kalau order sudah punya transaksi (sudah checkout)', async () => {
    const orderRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'order-1',
        website_id: 'site-1',
        status: 'PENDING',
        transaction_id: 'tx-1',
        metadata: {},
      }),
      save: jest.fn(),
    };
    const service = new OrdersService(
      new ConfigService(),
      orderRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(service.cancelDraftAsAdmin('site-1', 'order-1')).rejects.toThrow(
      'Order is already in a transaction',
    );
    expect(orderRepo.save).not.toHaveBeenCalled();
  });
});
