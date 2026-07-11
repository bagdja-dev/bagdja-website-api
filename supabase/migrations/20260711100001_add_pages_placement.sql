-- Penempatan halaman di navigasi: regular (tidak tampil di nav) | header | footer
ALTER TABLE website_pages
  ADD COLUMN IF NOT EXISTS placement VARCHAR(20) NOT NULL DEFAULT 'regular';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'website_pages_placement_check'
  ) THEN
    ALTER TABLE website_pages
      ADD CONSTRAINT website_pages_placement_check
      CHECK (placement IN ('regular', 'header', 'footer'));
  END IF;
END $$;

COMMENT ON COLUMN website_pages.placement IS 'regular | header | footer — tampil di navigasi header/footer template atau tidak sama sekali';
