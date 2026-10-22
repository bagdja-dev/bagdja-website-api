export type CheckoutPaymentMode = 'ADD_TO_CART' | 'ESCROW';

/**
 * Mode checkout Bagdja ditentukan TIPE produk, bukan `payment_meta`:
 * - `digital` → direct pay (`ADD_TO_CART`), aset dikirim begitu lunas.
 * - `product` / `service` / `package` (dan tipe lain) → `ESCROW`, dana
 *   ditahan sampai buyer konfirmasi terima / seller force-complete.
 *
 * Semua produk dijual lewat Bagdja checkout — `payment_meta` (termasuk link
 * eksternal LYNK lama) tidak lagi dibaca. Gathering tidak lewat jalur ini
 * (masuk lewat plan).
 */
export function resolvePaymentModeByProductType(
  productType: string | null | undefined,
): CheckoutPaymentMode {
  return productType === 'digital' ? 'ADD_TO_CART' : 'ESCROW';
}
