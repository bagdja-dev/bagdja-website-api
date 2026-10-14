import { GatheringController } from './gathering.controller';

describe('GatheringController — participant seat checkout', () => {
  it('retries the existing transaction when a previously failed invoice has no checkout URL', async () => {
    const order = {
      id: 'seat-order-1',
      transaction_id: 'transaction-1',
      transaction_status: 'PENDING_PAYMENT',
      checkout_url: 'https://pay.example/checkout?t=expired',
    };
    const occurrenceService = {
      createParticipantSeatOrder: jest.fn().mockResolvedValue(order),
    };
    const transactionsService = {
      retryCheckout: jest.fn().mockResolvedValue({ id: 'transaction-1', checkout_url: 'https://pay.example/retry' }),
    };
    const controller = new GatheringController(occurrenceService as any, transactionsService as any, {} as any);
    const user = { userId: 'buyer-1' } as any;

    await expect(controller.createParticipantSeatOrder(user, 'registration-1', 'http://localhost:5005'))
      .resolves.toEqual({ ...order, checkout_url: 'https://pay.example/retry' });

    expect(transactionsService.retryCheckout).toHaveBeenCalledWith(
      'transaction-1',
      user,
      'http://localhost:5005',
    );
  });
});
