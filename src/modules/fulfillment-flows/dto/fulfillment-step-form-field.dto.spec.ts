import { validate } from 'class-validator';

import { FulfillmentStepFormFieldDto } from './fulfillment-step-form-field.dto';

describe('FulfillmentStepFormFieldDto', () => {
  it('accepts buyer/seller ownership metadata for a form field', async () => {
    const dto = Object.assign(new FulfillmentStepFormFieldDto(), {
      key: 'tracking_number',
      label: 'Nomor Resi',
      type: 'text',
      required: true,
      filled_by: 'buyer',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect((dto as any).filled_by).toBe('buyer');
  });

  it('rejects invalid filled_by values', async () => {
    const dto = Object.assign(new FulfillmentStepFormFieldDto(), {
      key: 'tracking_number',
      label: 'Nomor Resi',
      type: 'text',
      filled_by: 'admin',
    });

    const errors = await validate(dto);

    expect(errors.some((err) => err.property === 'filled_by')).toBe(true);
  });
});
