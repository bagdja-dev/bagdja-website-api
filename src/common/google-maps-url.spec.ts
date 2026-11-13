import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { GatheringProductOptionInputDto } from '../modules/products/dto/replace-gathering-options.dto';

import { isGoogleMapsUrl } from './google-maps-url';

describe('isGoogleMapsUrl (gathering-option-location-plan L1)', () => {
  it.each([
    'https://maps.app.goo.gl/AbC123xyz',
    'https://goo.gl/maps/AbC123',
    'https://maps.google.com/?q=-6.26,106.81',
    'https://www.google.com/maps/place/Kemang/@-6.26,106.81,15z',
    'https://www.google.co.id/maps/search/studio+tanah',
  ])('accepts %s', (url) => {
    expect(isGoogleMapsUrl(url)).toBe(true);
  });

  it.each([
    'http://maps.app.goo.gl/AbC123',
    'https://maps.app.goo.gl.evil.test/x',
    'https://evil.test/maps',
    'https://www.google.com/search?q=maps',
    'javascript:alert(1)',
    'https://www.google.com/maps/"onmouseover=1',
  ])('rejects %s', (url) => {
    expect(isGoogleMapsUrl(url)).toBe(false);
  });
});

describe('GatheringProductOptionInputDto location fields', () => {
  const base = {
    option_group_key: 'sesi', option_key: 'pagi', label: 'Sesi pagi',
    price_per_seat: 100000, deposit_amount_per_seat: 0, min_attendees: 1, max_attendees: 10,
  };
  const errors = (extra: Record<string, unknown>) =>
    validateSync(plainToInstance(GatheringProductOptionInputDto, { ...base, ...extra }))
      .map((error) => error.property);

  it('accepts an address and a Google Maps link', () => {
    expect(errors({ venue_address: 'Jl. Kemang Raya No. 12, Jakarta Selatan', venue_map_url: 'https://maps.app.goo.gl/AbC123' }))
      .toEqual([]);
  });

  it('rejects non-Google map links and over-long addresses', () => {
    expect(errors({ venue_map_url: 'https://evil.test/maps' })).toEqual(['venue_map_url']);
    expect(errors({ venue_address: 'x'.repeat(501) })).toEqual(['venue_address']);
  });
});
