-- Company profile Phase 3 correction:
-- External-page behavior belongs to website_pages, not a separate menu entity.

ALTER TABLE website_pages
  ADD COLUMN IF NOT EXISTS link_mode VARCHAR(20) NOT NULL DEFAULT 'internal'
    CHECK (link_mode IN ('internal', 'external')),
  ADD COLUMN IF NOT EXISTS external_url VARCHAR(1000);

ALTER TABLE website_page_translations
  ADD COLUMN IF NOT EXISTS external_url VARCHAR(1000),
  ADD COLUMN IF NOT EXISTS external_target VARCHAR(10) NOT NULL DEFAULT '_self'
    CHECK (external_target IN ('_self', '_blank')),
  ADD COLUMN IF NOT EXISTS external_rel VARCHAR(255);

UPDATE website_pages
SET link_mode = 'internal', external_url = NULL
WHERE link_mode IS NULL;

DROP TABLE IF EXISTS website_menu_item_translations;
DROP TABLE IF EXISTS website_menu_items;
