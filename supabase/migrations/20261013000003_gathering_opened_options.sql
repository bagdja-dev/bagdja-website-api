ALTER TABLE website_gathering_occurrences
  ADD COLUMN IF NOT EXISTS opened_option_ids_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE website_gathering_occurrences
SET opened_option_ids_snapshot = COALESCE(
  (
    SELECT jsonb_agg(option->>'product_option_id')
    FROM jsonb_array_elements(option_groups_snapshot) AS option
    WHERE option ? 'product_option_id'
  ),
  '[]'::jsonb
)
WHERE opened_option_ids_snapshot = '[]'::jsonb;