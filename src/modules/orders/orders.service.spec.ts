import { ConfigService } from '@nestjs/config';
import { IsNull } from 'typeorm';

import { OrdersService } from './orders.service';

describe('OrdersService', () => {
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
