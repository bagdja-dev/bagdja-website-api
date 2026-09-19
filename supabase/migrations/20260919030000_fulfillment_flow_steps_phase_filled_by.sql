-- fulfillment-praorder-plan.md Fase 1 (§2.1, Q11) — fondasi Step Praorder
-- vs Pascaorder di level Fulfillment Flow. Aditif, backward compatible:
-- default PASCAORDER/admin utk semua step existing = perilaku sekarang
-- tidak berubah sama sekali.
ALTER TABLE fulfillment_flow_steps
  ADD COLUMN IF NOT EXISTS phase VARCHAR(20) NOT NULL DEFAULT 'PASCAORDER',
  ADD COLUMN IF NOT EXISTS filled_by VARCHAR(20) NOT NULL DEFAULT 'admin';

-- PostgreSQL tidak dukung ADD CONSTRAINT IF NOT EXISTS — dibungkus DO block
-- supaya migration tetap aman dijalankan ulang (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fulfillment_flow_steps_phase_check'
  ) THEN
    ALTER TABLE fulfillment_flow_steps
      ADD CONSTRAINT fulfillment_flow_steps_phase_check CHECK (phase IN ('PRAORDER', 'PASCAORDER'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fulfillment_flow_steps_filled_by_check'
  ) THEN
    ALTER TABLE fulfillment_flow_steps
      ADD CONSTRAINT fulfillment_flow_steps_filled_by_check CHECK (filled_by IN ('admin', 'buyer'));
  END IF;
END $$;
