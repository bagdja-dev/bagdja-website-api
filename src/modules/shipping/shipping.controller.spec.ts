import { effectiveWeightGrams } from './shipping.controller';

describe('effectiveWeightGrams', () => {
  it('uses the default 250g/30x30x5cm when the product has nothing set', () => {
    // volumetric = (30*30*5)/6000 kg = 0.75kg = 750g > default 250g actual
    expect(
      effectiveWeightGrams({ weight_grams: null, length_cm: null, width_cm: null, height_cm: null }),
    ).toBe(750);
  });

  it('picks actual weight when it is heavier than the volumetric weight', () => {
    // volumetric = (10*10*5)/6000 kg = 0.0833kg ≈ 83.3g, actual 5000g wins
    expect(
      effectiveWeightGrams({ weight_grams: 5000, length_cm: 10, width_cm: 10, height_cm: 5 }),
    ).toBe(5000);
  });

  it('picks volumetric weight when it is heavier than the actual weight (bulky/light item)', () => {
    // volumetric = (50*50*50)/6000 kg = 20.83kg = 20833.33g > actual 500g
    const result = effectiveWeightGrams({ weight_grams: 500, length_cm: 50, width_cm: 50, height_cm: 50 });
    expect(result).toBeCloseTo(20833.33, 1);
  });

  it('falls back to default dimensions per-axis when only some are set', () => {
    // length/width default 30, height explicit 10 -> (30*30*10)/6000 kg = 1.5kg = 1500g
    expect(
      effectiveWeightGrams({ weight_grams: 100, length_cm: null, width_cm: null, height_cm: 10 }),
    ).toBe(1500);
  });
});
