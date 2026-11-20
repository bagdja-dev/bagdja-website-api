ALTER TABLE website_portfolio_projects
  ADD COLUMN IF NOT EXISTS name VARCHAR(255);

UPDATE website_portfolio_projects AS project
SET name = COALESCE(
  NULLIF(project.name, ''),
  (
    SELECT translation.title
    FROM website_portfolio_project_translations AS translation
    WHERE translation.project_id = project.id
    ORDER BY (translation.locale = 'id') DESC, translation.created_at ASC
    LIMIT 1
  ),
  project.slug
);

ALTER TABLE website_portfolio_projects
  ALTER COLUMN name SET NOT NULL;
