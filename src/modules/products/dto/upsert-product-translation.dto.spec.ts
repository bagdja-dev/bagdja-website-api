import { validate } from 'class-validator';

import { UpsertProductTranslationDto } from './upsert-product-translation.dto';

describe('UpsertProductTranslationDto', () => {
  it('accepts an empty slug so the service can use the base product slug', async () => {
    const dto = Object.assign(new UpsertProductTranslationDto(), {
      slug: '',
      name: 'Produk terjemahan',
    });

    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects malformed translated slugs', async () => {
    const dto = Object.assign(new UpsertProductTranslationDto(), {
      slug: 'Produk Terjemahan',
      name: 'Produk terjemahan',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'slug')).toBe(true);
  });
});
