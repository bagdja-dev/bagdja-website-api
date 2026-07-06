-- Skema warna per-tenant (override template default)
ALTER TABLE websites
  ADD COLUMN IF NOT EXISTS theme JSONB NOT NULL DEFAULT '{}';

COMMENT ON COLUMN websites.theme IS 'Brand color scheme: { mode, accent, font } — overrides template.structure.theme';
