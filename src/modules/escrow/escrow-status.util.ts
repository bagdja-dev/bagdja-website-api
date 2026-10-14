/**
 * `EscrowStatus` (bagdja-payment-service) mulai dari `PENDING`, sementara
 * `WebsiteTransaction.status` mulai dari `PENDING_PAYMENT` — dua vocabulary
 * berbeda untuk kondisi yang sama (belum dibayar). Normalisasi di SATU
 * tempat ini supaya `transaction.status` konsisten pakai vocabulary sendiri
 * kapan pun ditulis dari status escrow (sync baca, release, dispute, refund).
 *
 * Catatan: `WebsiteOrder.status` sengaja memakai vocabulary EscrowStatus
 * apa adanya, jadi helper ini HANYA untuk `WebsiteTransaction.status`.
 */
export function normalizeEscrowStatus(escrowStatus: string): string {
  return escrowStatus === 'PENDING' ? 'PENDING_PAYMENT' : escrowStatus;
}
