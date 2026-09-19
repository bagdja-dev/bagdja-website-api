import { validate } from 'class-validator';

import { CreateProductDto } from './create-product.dto';

describe('CreateProductDto', () => {
  it('accepts valid service specifications and estimation table', async () => {
    const dto = Object.assign(new CreateProductDto(), {
      name: 'Jasa Pembersihan AC',
      slug: 'jasa-pembersihan-ac',
      type: 'service',
      specifications: {
        material: 'Aluminium composite',
        area: '1x2 meter',
      },
      estimation: [
        { label: 'Basic', price: 150000 },
        { label: 'Premium', price: 250000 },
      ],
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.specifications).toEqual({
      material: 'Aluminium composite',
      area: '1x2 meter',
    });
    expect(dto.estimation).toHaveLength(2);
  });

  it('rejects invalid estimation payload', async () => {
    const dto = Object.assign(new CreateProductDto(), {
      name: 'Jasa Cuci Mobil',
      slug: 'jasa-cuci-mobil',
      type: 'service',
      specifications: { unit: 'mobil' },
      estimation: { label: 'Basic', price: 150000 },
    });

    const errors = await validate(dto);

    expect(errors.some((err) => err.property === 'estimation')).toBe(true);
  });
});
