ALTER TABLE website_portfolio_projects
  ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb;

WITH tag_values AS (
  SELECT
    translation.project_id,
    translation.locale,
    tag.value AS tag,
    tag.ordinality AS tag_order
  FROM website_portfolio_project_translations AS translation
  CROSS JOIN LATERAL jsonb_array_elements_text(
    CASE
      WHEN jsonb_typeof(translation.tags) = 'array' THEN translation.tags
      ELSE '[]'::jsonb
    END
  ) WITH ORDINALITY AS tag(value, ordinality)
  WHERE btrim(tag.value) <> ''
),
unique_tags AS (
  SELECT DISTINCT ON (project_id, lower(btrim(tag)))
    project_id,
    btrim(tag) AS tag,
    locale,
    tag_order
  FROM tag_values
  ORDER BY project_id, lower(btrim(tag)), (locale = 'id') DESC, locale, tag_order
),
ranked_tags AS (
  SELECT
    project_id,
    tag,
    row_number() OVER (
      PARTITION BY project_id
      ORDER BY (locale = 'id') DESC, locale, tag_order
    ) AS project_tag_order
  FROM unique_tags
),
project_tags AS (
  SELECT
    project_id,
    jsonb_agg(tag ORDER BY project_tag_order) AS tags
  FROM ranked_tags
  WHERE project_tag_order <= 20
  GROUP BY project_id
)
UPDATE website_portfolio_projects AS project
SET tags = project_tags.tags
FROM project_tags
WHERE project.id = project_tags.project_id;

UPDATE website_portfolio_project_translations AS translation
SET tags = project.tags
FROM website_portfolio_projects AS project
WHERE translation.project_id = project.id;
