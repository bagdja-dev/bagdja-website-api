import { maskEmail, maskPhone } from './gathering-occurrence.service';

/** Kontak peserta yang ditampilkan di halaman undangan selalu tersamar. */
describe('contact masking', () => {
  it('masks WhatsApp numbers keeping the prefix and last three digits', () => {
    expect(maskPhone('+6281234567890')).toBe('+6281••••••890');
    expect(maskPhone('081234567890')).toBe('0812•••••890');
    expect(maskPhone('+62 812-3456-7890')).toBe('+6281••••••890');
    expect(maskPhone('12345')).toBeNull();
    expect(maskPhone(null)).toBeNull();
  });

  it('masks emails keeping the domain', () => {
    expect(maskEmail('permatasari@gmail.com')).toBe('pe•••••••••@gmail.com');
    expect(maskEmail(null)).toBeNull();
  });
});
