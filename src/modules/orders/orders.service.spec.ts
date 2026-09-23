import { ConfigService } from '@nestjs/config';

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
});
