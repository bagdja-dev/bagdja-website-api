ALTER TABLE website_portfolio_projects
  ADD COLUMN IF NOT EXISTS photos JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS video_url VARCHAR(1000),
  ADD COLUMN IF NOT EXISTS model3d_url VARCHAR(1000);

UPDATE website_portfolio_projects
SET photos = jsonb_build_array(jsonb_build_object('url', cover_image, 'alt', '', 'caption', ''))
WHERE cover_image IS NOT NULL
  AND photos = '[]'::jsonb;

ALTER TABLE website_portfolio_project_translations
  ADD COLUMN IF NOT EXISTS excerpt VARCHAR(500),
  ADD COLUMN IF NOT EXISTS detail TEXT,
  ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE website_portfolio_project_translations
SET excerpt = COALESCE(excerpt, summary),
    detail = COALESCE(detail, description)
WHERE excerpt IS NULL OR detail IS NULL;
