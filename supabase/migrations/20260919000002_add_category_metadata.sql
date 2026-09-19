-- =============================================================
-- website_categories metadata tambahan: deskripsi, spesifikasi, estimasi
-- =============================================================

ALTER TABLE website_categories
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS specifications JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS estimation JSONB NOT NULL DEFAULT '[]';

UPDATE website_categories
SET description = NULL,
    specifications = COALESCE(specifications, '{}')::jsonb,
    estimation = COALESCE(estimation, '[]')::jsonb
WHERE description IS NULL OR specifications IS NULL OR estimation IS NULL;
