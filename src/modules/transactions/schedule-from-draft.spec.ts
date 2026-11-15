import { ConfigService } from '@nestjs/config';

import { TransactionsService } from './transactions.service';

/** "Simpan draft" langkah praorder juga mengisi jadwal kalender (tanpa menunggu "Kirim data"). */
describe('savePraorderStepDraftAsBuyer → jadwal kalender', () => {
  const step = {
    status_name: 'Detail Acara',
    filled_by: 'buyer',
    form_schema: [
      { key: 'nama', label: 'Nama Acara', type: 'text', required: true },
      { key: 'tanggal', label: 'Tanggal Acara', type: 'tanggal', required: true, calendar_role: 'start' },
    ],
  };

  function build() {
    const orderRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'order-1', buyer_user_id: 'buyer-1', product: { quotable: true } }),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const fulfillmentLogRepo = { create: jest.fn((value) => value), save: jest.fn(async (value) => value) };
    const service = new TransactionsService(
      new ConfigService(),
      {} as any, {} as any, orderRepo as any, {} as any, {} as any, {} as any,
      fulfillmentLogRepo as any, {} as any, {} as any, {} as any,
      { notifyUser: jest.fn(), notifyWebsiteStaff: jest.fn() } as any,
      {} as any,
    ) as any;
    service.resolvePraorderStepOrThrow = jest.fn().mockResolvedValue({ step, logs: [], nextStep: null });
    return { service, orderRepo, fulfillmentLogRepo };
  }

  it('copies a valid calendar date from the draft to the order schedule', async () => {
    const { service, orderRepo, fulfillmentLogRepo } = build();
    await service.savePraorderStepDraftAsBuyer('order-1', { step_name: 'Detail Acara', form_data: { nama: 'Rapat', tanggal: '2026-11-20' } }, 'buyer-1');
    expect(fulfillmentLogRepo.save).toHaveBeenCalledWith(expect.objectContaining({ event_type: 'STEP_DRAFT' }));
    expect(orderRepo.update).toHaveBeenCalledWith(
      { id: 'order-1' },
      { scheduled_start_at: new Date('2026-11-19T17:00:00.000Z'), scheduled_end_at: null, scheduled_all_day: true },
    );
  });

  it('leaves the schedule untouched when the draft has no valid calendar date', async () => {
    const { service, orderRepo } = build();
    await service.savePraorderStepDraftAsBuyer('order-1', { step_name: 'Detail Acara', form_data: { nama: 'Rapat', tanggal: '' } }, 'buyer-1');
    expect(orderRepo.update).not.toHaveBeenCalled();
  });
});
