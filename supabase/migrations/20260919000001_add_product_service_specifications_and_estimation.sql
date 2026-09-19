-- =============================================================
-- Phase 6: service product specification + estimation table
-- =============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'website_products' AND column_name = 'specifications'
  ) THEN
    ALTER TABLE website_products ADD COLUMN specifications JSONB NOT NULL DEFAULT '{}';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'website_products' AND column_name = 'estimation'
  ) THEN
    ALTER TABLE website_products ADD COLUMN estimation JSONB NOT NULL DEFAULT '[]';
  END IF;
END $$;
