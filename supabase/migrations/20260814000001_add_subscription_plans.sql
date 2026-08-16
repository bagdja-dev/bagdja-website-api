-- =============================================================
-- subscription_plans — local cache dari subscription plans
-- di bagdja-payment-service. Digunakan untuk menampilkan
-- pricing tiers di UI dan untuk validasi saat subscribe.
-- =============================================================

CREATE TABLE IF NOT EXISTS subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT UNIQUE NOT NULL,
  app_id TEXT NOT NULL,
  name TEXT NOT NULL,
  price_monthly NUMERIC NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  synced_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_subscription_plans_app_id ON subscription_plans(app_id);
CREATE INDEX IF NOT EXISTS idx_subscription_plans_external_id ON subscription_plans(external_id);
CREATE INDEX IF NOT EXISTS idx_subscription_plans_is_active ON subscription_plans(is_active);
