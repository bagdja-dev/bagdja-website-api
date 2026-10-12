import { ConfigService } from '@nestjs/config';

import { TransactionsService } from './transactions.service';

/** Guard checkout gathering (plan event-registration §0) — order rencana tidak pernah checkout, seat menunggu PAYMENT_OPEN. */
describe('TransactionsService.createCheckout — gathering orders', () => {
  function buildService(order: Record<string, unknown>, occurrence: { id: string; status: string } | null = null) {
    const occurrenceRepo = { findOne: jest.fn().mockResolvedValue(occurrence) };
    const orderRepo = {
      find: jest.fn().mockResolvedValue([order]),
      save: jest.fn(),
      manager: { getRepository: jest.fn(() => occurrenceRepo) },
    };
    const service = new TransactionsService(
      new ConfigService(),
      {} as any, // transactionRepo
      {} as any, // itemRepo
      orderRepo as any,
      {} as any, // productRepo
      {} as any, // websiteRepo
      {} as any, // flowRepo
      {} as any, // fulfillmentLogRepo
      {} as any, // terminRepo
      {} as any, // escrowClient
      {} as any, // shippingCalculation
      { notifyUser: jest.fn(), notifyWebsiteStaff: jest.fn() } as any,
      {} as any, // digitalDelivery
    );
    return { service, occurrenceRepo };
  }

  const baseOrder = {
    id: 'order-1',
    website_id: 'site-1',
    status: 'PENDING',
    transaction_id: null,
    product: { type: 'gathering' },
  };

  it('never checks out the initiator plan order', async () => {
    const { service, occurrenceRepo } = buildService({
      ...baseOrder,
      quantity: 0,
      total_amount: 0,
      metadata: { gathering: { role: 'initiator', group_id: 'group-1', occurrence_id: 'occ-1' } },
    });

    await expect(service.createCheckout({ userId: 'buyer-1' } as any, { order_ids: ['order-1'] } as any))
      .rejects.toThrow('Order order-1 adalah rencana gathering dan tidak dapat di-checkout');
    expect(occurrenceRepo.findOne).not.toHaveBeenCalled();
  });

  it('blocks participant seat checkout until the occurrence is PAYMENT_OPEN', async () => {
    const { service, occurrenceRepo } = buildService(
      {
        ...baseOrder,
        quantity: 1,
        total_amount: 150000,
        metadata: { gathering: { role: 'participant', group_id: 'group-1', occurrence_id: 'occ-1' } },
      },
      { id: 'occ-1', status: 'RSVP_OPEN' },
    );

    await expect(service.createCheckout({ userId: 'buyer-1' } as any, { order_ids: ['order-1'] } as any))
      .rejects.toThrow('Order order-1 belum bisa dibayar: pembayaran gathering belum dibuka');
    expect(occurrenceRepo.findOne).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'occ-1', website_id: 'site-1' },
    }));
  });
});
