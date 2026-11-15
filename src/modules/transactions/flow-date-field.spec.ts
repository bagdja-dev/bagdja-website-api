import { isCalendarDate, isLocalDateTime } from './transactions.service';

describe('isCalendarDate (field flow tipe tanggal)', () => {
  it('accepts real calendar dates in YYYY-MM-DD', () => {
    expect(isCalendarDate('2026-11-15')).toBe(true);
    expect(isCalendarDate('2028-02-29')).toBe(true);
  });

  it('rejects impossible dates, other formats, and non-strings', () => {
    expect(isCalendarDate('2026-02-30')).toBe(false);
    expect(isCalendarDate('2027-02-29')).toBe(false);
    expect(isCalendarDate('15/11/2026')).toBe(false);
    expect(isCalendarDate('2026-11-15T10:00:00Z')).toBe(false);
    expect(isCalendarDate(20261115)).toBe(false);
  });
});

describe('isLocalDateTime (field flow tipe tanggal_waktu)', () => {
  it('accepts YYYY-MM-DDTHH:mm with a real date and time', () => {
    expect(isLocalDateTime('2026-11-15T09:30')).toBe(true);
    expect(isLocalDateTime('2026-11-15T23:59')).toBe(true);
  });

  it('rejects impossible times, seconds/zones, and date-only values', () => {
    expect(isLocalDateTime('2026-11-15T24:00')).toBe(false);
    expect(isLocalDateTime('2026-02-30T10:00')).toBe(false);
    expect(isLocalDateTime('2026-11-15T09:30:00')).toBe(false);
    expect(isLocalDateTime('2026-11-15T09:30+07:00')).toBe(false);
    expect(isLocalDateTime('2026-11-15')).toBe(false);
  });
});
