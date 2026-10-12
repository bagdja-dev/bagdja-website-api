import { BadRequestException } from '@nestjs/common';

import {
  assertValidGatheringProductConfig,
  assertUniformGatheringOptionConfig,
  normalizeGatheringCancellationPolicy,
} from './gathering-product-options.validation';

describe('gathering product option validation', () => {
  it('normalizes a valid fixed cancellation policy', () => {
    expect(normalizeGatheringCancellationPolicy({
      cutoff_days_before_event: 3,
      penalty_type: 'FIXED',
      penalty_value: 25000,
      summary: 'Hubungi organizer untuk pembatalan.',
    }, 100000)).toEqual({
      version: 1,
      cutoff_days_before_event: 3,
      penalty_type: 'FIXED',
      penalty_value: 25000,
      currency: 'IDR',
      summary: 'Hubungi organizer untuk pembatalan.',
    });
  });

  it('rejects penalty percentages over 100 and fixed penalties above seat price', () => {
    expect(() => normalizeGatheringCancellationPolicy({
      cutoff_days_before_event: 0,
      penalty_type: 'PERCENTAGE',
      penalty_value: 101,
    }, 100000)).toThrow(BadRequestException);
    expect(() => normalizeGatheringCancellationPolicy({
      cutoff_days_before_event: 0,
      penalty_type: 'FIXED',
      penalty_value: 100001,
    }, 100000)).toThrow(BadRequestException);
  });

  it('requires all product choices to use the same fixed commercial terms', () => {
    const base = {
      price_per_seat: 100000,
      currency: 'IDR',
      min_attendees: 5,
      max_attendees: 20,
      cancellation_policy: { penalty_type: 'NONE', penalty_value: 0 },
    };

    expect(() => assertUniformGatheringOptionConfig([base, { ...base, max_attendees: 25 }]))
      .toThrow(BadRequestException);
    expect(() => assertUniformGatheringOptionConfig([base, { ...base, currency: 'USD' }]))
      .toThrow(BadRequestException);
  });

  it('accepts valid gathering product bounds and rejects invalid bounds or price', () => {
    expect(() => assertValidGatheringProductConfig('gathering', 0, {
      min_attendees: 0,
      max_attendees: 10,
    })).not.toThrow();
    expect(() => assertValidGatheringProductConfig('gathering', -1, {
      min_attendees: 0,
      max_attendees: 10,
    })).toThrow(BadRequestException);
    expect(() => assertValidGatheringProductConfig('gathering', 100000, {
      min_attendees: 10,
      max_attendees: 5,
    })).toThrow(BadRequestException);
  });
});