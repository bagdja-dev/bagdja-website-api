BEGIN;

ALTER TABLE websites
  ADD COLUMN IF NOT EXISTS website_initial VARCHAR(4);

CREATE OR REPLACE FUNCTION set_website_initial()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  consonant_alphabet CONSTANT TEXT := 'BCDFGHJKLMNPQRSTVWXYZ';
  consonants TEXT;
  candidate TEXT;
  attempt INTEGER := 0;
  encoded_attempt INTEGER;
  position INTEGER;
BEGIN
  IF NEW.website_initial IS NOT NULL AND btrim(NEW.website_initial) <> '' THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(7061901901);
  consonants := regexp_replace(upper(COALESCE(NEW.name, '')), '[^BCDFGHJKLMNPQRSTVWXYZ]', '', 'g');
  candidate := rpad(left(consonants, 4), 4, 'X');

  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM websites
      WHERE website_initial = candidate
        AND id IS DISTINCT FROM NEW.id
    ) THEN
      NEW.website_initial := candidate;
      RETURN NEW;
    END IF;

    attempt := attempt + 1;
    IF attempt >= length(consonant_alphabet) ^ 4 THEN
      RAISE EXCEPTION 'Could not allocate a unique website initial';
    END IF;

    encoded_attempt := attempt - 1;
    candidate := '';
    FOR position IN REVERSE 4..1 LOOP
      candidate := substr(
        consonant_alphabet,
        (encoded_attempt % length(consonant_alphabet)) + 1,
        1
      ) || candidate;
      encoded_attempt := encoded_attempt / length(consonant_alphabet);
    END LOOP;
  END LOOP;
END;
$$;

DROP TRIGGER IF EXISTS websites_set_initial ON websites;
CREATE TRIGGER websites_set_initial
  BEFORE INSERT OR UPDATE ON websites
  FOR EACH ROW
  EXECUTE FUNCTION set_website_initial();

UPDATE websites
SET website_initial = NULL
WHERE website_initial IS NULL OR btrim(website_initial) = '';

ALTER TABLE websites
  ALTER COLUMN website_initial SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_websites_website_initial
  ON websites(website_initial);

ALTER TABLE website_event_groups
  ADD COLUMN IF NOT EXISTS plan_number VARCHAR(32);

CREATE TABLE IF NOT EXISTS website_gathering_plan_counters (
  website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  plan_date DATE NOT NULL,
  last_sequence INTEGER NOT NULL CHECK (last_sequence > 0),
  PRIMARY KEY (website_id, plan_date)
);

WITH numbered_plans AS (
  SELECT
    event_group.id,
    event_group.website_id,
    (event_group.created_at AT TIME ZONE 'Asia/Jakarta')::DATE AS plan_date,
    row_number() OVER (
      PARTITION BY event_group.website_id, (event_group.created_at AT TIME ZONE 'Asia/Jakarta')::DATE
      ORDER BY event_group.created_at, event_group.id
    ) AS sequence_number
  FROM website_event_groups AS event_group
  WHERE event_group.plan_number IS NULL
)
UPDATE website_event_groups AS event_group
SET plan_number = websites.website_initial
  || '-GTR-' || to_char(numbered_plans.plan_date, 'DD-MM-YYYY')
  || '-' || lpad(numbered_plans.sequence_number::TEXT, 3, '0')
FROM numbered_plans
JOIN websites ON websites.id = numbered_plans.website_id
WHERE event_group.id = numbered_plans.id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_website_event_groups_plan_number
  ON website_event_groups(plan_number);

INSERT INTO website_gathering_plan_counters (website_id, plan_date, last_sequence)
SELECT
  event_group.website_id,
  (event_group.created_at AT TIME ZONE 'Asia/Jakarta')::DATE,
  max((regexp_match(event_group.plan_number, '-([0-9]+)$'))[1]::INTEGER)
FROM website_event_groups AS event_group
WHERE event_group.plan_number IS NOT NULL
GROUP BY event_group.website_id, (event_group.created_at AT TIME ZONE 'Asia/Jakarta')::DATE
ON CONFLICT (website_id, plan_date)
DO UPDATE SET last_sequence = GREATEST(
  website_gathering_plan_counters.last_sequence,
  EXCLUDED.last_sequence
);

CREATE OR REPLACE FUNCTION set_gathering_plan_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  website_code TEXT;
  local_plan_date DATE;
  next_sequence INTEGER;
BEGIN
  IF NEW.plan_number IS NOT NULL AND btrim(NEW.plan_number) <> '' THEN
    RETURN NEW;
  END IF;

  SELECT website_initial
  INTO website_code
  FROM websites
  WHERE id = NEW.website_id;

  IF website_code IS NULL THEN
    RAISE EXCEPTION 'Cannot generate gathering plan number: website initial is missing';
  END IF;

  local_plan_date := (COALESCE(NEW.created_at, now()) AT TIME ZONE 'Asia/Jakarta')::DATE;

  INSERT INTO website_gathering_plan_counters (website_id, plan_date, last_sequence)
  VALUES (NEW.website_id, local_plan_date, 1)
  ON CONFLICT (website_id, plan_date)
  DO UPDATE SET last_sequence = website_gathering_plan_counters.last_sequence + 1
  RETURNING last_sequence INTO next_sequence;

  NEW.plan_number := website_code
    || '-GTR-' || to_char(local_plan_date, 'DD-MM-YYYY')
    || '-' || lpad(next_sequence::TEXT, 3, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS website_event_groups_set_plan_number ON website_event_groups;
CREATE TRIGGER website_event_groups_set_plan_number
  BEFORE INSERT ON website_event_groups
  FOR EACH ROW
  EXECUTE FUNCTION set_gathering_plan_number();

COMMIT;
