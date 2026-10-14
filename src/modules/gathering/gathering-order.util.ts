/**
 * Penanda order gathering di `website_orders.metadata.gathering` — setara
 * `metadata.preorder` pada quotation (plan event-registration §0).
 * - `initiator`: order rencana di cart initiator; tanpa seat, tidak pernah di-checkout.
 * - `participant`: order seat peserta (Phase 3/4), anak dari order rencana.
 */
export type GatheringOrderRole = 'initiator' | 'participant';

export interface GatheringOrderMeta {
  role: GatheringOrderRole;
  group_id: string;
  occurrence_id: string;
  deposit_amount_per_seat?: number;
}

export function getGatheringOrderMeta(metadata: Record<string, unknown> | null | undefined): GatheringOrderMeta | null {
  const value = metadata?.['gathering'];
  if (!value || typeof value !== 'object') return null;
  const meta = value as Partial<GatheringOrderMeta>;
  if ((meta.role !== 'initiator' && meta.role !== 'participant') || !meta.group_id || !meta.occurrence_id) {
    return null;
  }
  const depositAmount = Number(meta.deposit_amount_per_seat ?? 0);
  return {
    role: meta.role,
    group_id: meta.group_id,
    occurrence_id: meta.occurrence_id,
    deposit_amount_per_seat: Number.isFinite(depositAmount) ? depositAmount : 0,
  };
}
