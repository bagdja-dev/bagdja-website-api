CREATE TABLE IF NOT EXISTS website_analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('page_view', 'cta_click')),
  visitor_hash VARCHAR(64) NOT NULL,
  page_path VARCHAR(500) NOT NULL,
  source VARCHAR(120) NOT NULL DEFAULT 'Langsung',
  label VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_website_analytics_events_website_created
  ON website_analytics_events(website_id, created_at);

CREATE INDEX IF NOT EXISTS idx_website_analytics_events_created
  ON website_analytics_events(created_at);

CREATE INDEX IF NOT EXISTS idx_website_analytics_events_website_type_created
  ON website_analytics_events(website_id, event_type, created_at);
