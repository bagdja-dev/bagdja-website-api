import type { FulfillmentStepFormField } from '../../entities/fulfillment-flow-step.entity';
import { deriveServiceScheduleStatus } from '../orders/orders.service';
import { extractOrderSchedule } from './transactions.service';

const field = (overrides: Partial<FulfillmentStepFormField>): FulfillmentStepFormField => ({
  key: 'f',
  label: 'Field',
  type: 'tanggal',
  required: false,
  filled_by: 'buyer',
  ...overrides,
}) as FulfillmentStepFormField;

describe('extractOrderSchedule (field flow bertanda kalender)', () => {
  it('returns null when no field carries calendar_role', () => {
    const schema = [field({ key: 'tgl', type: 'tanggal' })];
    expect(extractOrderSchedule(schema, { tgl: '2026-11-20' })).toBeNull();
  });

  it('maps a tanggal start field to an all-day WIB midnight', () => {
    const schema = [field({ key: 'tgl', type: 'tanggal', calendar_role: 'start' })];
    const result = extractOrderSchedule(schema, { tgl: '2026-11-20' });
    expect(result?.start.toISOString()).toBe('2026-11-19T17:00:00.000Z');
    expect(result?.allDay).toBe(true);
    expect(result?.end).toBeNull();
  });

  it('maps tanggal_waktu start/end in WIB and keeps a valid end', () => {
    const schema = [
      field({ key: 'mulai', type: 'tanggal_waktu', calendar_role: 'start' }),
      field({ key: 'selesai', type: 'tanggal_waktu', calendar_role: 'end' }),
    ];
    const result = extractOrderSchedule(schema, { mulai: '2026-11-20T09:00', selesai: '2026-11-20T12:30' });
    expect(result?.start.toISOString()).toBe('2026-11-20T02:00:00.000Z');
    expect(result?.end?.toISOString()).toBe('2026-11-20T05:30:00.000Z');
    expect(result?.allDay).toBe(false);
  });

  it('drops an end before start, and ignores empty/invalid values or non-date types', () => {
    const schema = [
      field({ key: 'catatan', type: 'text', calendar_role: 'start' }),
      field({ key: 'mulai', type: 'tanggal_waktu', calendar_role: 'start' }),
      field({ key: 'selesai', type: 'tanggal_waktu', calendar_role: 'end' }),
    ];
    const result = extractOrderSchedule(schema, { catatan: '2026-11-20', mulai: '2026-11-20T09:00', selesai: '2026-11-19T09:00' });
    expect(result?.start.toISOString()).toBe('2026-11-20T02:00:00.000Z');
    expect(result?.end).toBeNull();
    expect(extractOrderSchedule(schema, { mulai: '' })).toBeNull();
    expect(extractOrderSchedule(schema, undefined)).toBeNull();
  });
});

describe('deriveServiceScheduleStatus (tahap jasa di kalender)', () => {
  const base = { orderStatus: 'PENDING', transactionStatus: null, praorderReady: false, openTermins: 0 };

  it('before checkout: planning until quotation + praorder are ready, then payment', () => {
    expect(deriveServiceScheduleStatus(base)).toBe('planning');
    expect(deriveServiceScheduleStatus({ ...base, praorderReady: true })).toBe('payment');
  });

  it('after checkout: payment while unpaid, confirmed once paid (DP)', () => {
    expect(deriveServiceScheduleStatus({ ...base, transactionStatus: 'PENDING_PAYMENT' })).toBe('payment');
    expect(deriveServiceScheduleStatus({ ...base, transactionStatus: 'HELD' })).toBe('confirmed');
    expect(deriveServiceScheduleStatus({ ...base, transactionStatus: 'DISPUTED' })).toBe('confirmed');
  });

  it('completed only when the transaction is done and every termin is paid', () => {
    expect(deriveServiceScheduleStatus({ ...base, transactionStatus: 'COMPLETED', openTermins: 1 })).toBe('confirmed');
    expect(deriveServiceScheduleStatus({ ...base, transactionStatus: 'COMPLETED' })).toBe('completed');
    expect(deriveServiceScheduleStatus({ ...base, transactionStatus: 'CLOSED' })).toBe('completed');
  });

  it('hides cancelled, refunded and expired orders', () => {
    expect(deriveServiceScheduleStatus({ ...base, orderStatus: 'CANCELLED' })).toBeNull();
    expect(deriveServiceScheduleStatus({ ...base, transactionStatus: 'REFUNDED' })).toBeNull();
    expect(deriveServiceScheduleStatus({ ...base, transactionStatus: 'EXPIRED' })).toBeNull();
  });
});
