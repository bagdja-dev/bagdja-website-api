ALTER TABLE website_gathering_occurrences
  ALTER COLUMN final_schedule TYPE TIMESTAMPTZ
  USING CASE
    WHEN NULLIF(BTRIM(final_schedule::TEXT), '') IS NULL THEN NULL
    ELSE final_schedule::TEXT::TIMESTAMPTZ
  END;