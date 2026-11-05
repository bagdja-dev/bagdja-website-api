import { buildSeedProductMetadata } from './website-bootstrap.service';

describe('buildSeedProductMetadata', () => {
  it('marks seeded products and preserves their seed metadata', () => {
    expect(
      buildSeedProductMetadata(
        {
          name: 'Contoh layanan',
          price: 250000,
          sku: 'SVC-01',
          duration_minutes: 60,
          variant_attributes: { ukuran: 'M' },
          inherit_description: true,
        },
        'service',
      ),
    ).toEqual({
      is_seed: true,
      sku: 'SVC-01',
      duration_minutes: 60,
      variant_attributes: { ukuran: 'M' },
      inherit_description: true,
    });
  });

  it('does not attach service-only metadata to seeded products', () => {
    expect(
      buildSeedProductMetadata(
        { name: 'Contoh produk', price: 100000, duration_minutes: 60 },
        'product',
      ),
    ).toEqual({ is_seed: true });
  });
});
