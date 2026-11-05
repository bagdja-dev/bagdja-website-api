-- Studio S1 (plan/website-builder/template-contract.md §1.2, admin-redesign-onboarding-plan.md §4.1)
-- Business profile (preset onboarding) + snapshot modul aktif per website.
-- Semua kolom punya default → perilaku client/dashboard lama tidak berubah.

-- 'legacy' = website yang sudah ada sebelum Studio. enabled_modules kosong
-- untuk legacy berarti "semua modul available aktif" (dihitung di API).
ALTER TABLE websites
  ADD COLUMN IF NOT EXISTS business_profile VARCHAR(50) NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS enabled_modules TEXT[] NOT NULL DEFAULT '{}';

-- Template yang direkomendasikan untuk profile tertentu (filter GET /api/templates?business_profile=).
ALTER TABLE website_templates
  ADD COLUMN IF NOT EXISTS business_profiles TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_website_templates_business_profiles
  ON website_templates USING gin (business_profiles);

-- Manifest template (R1, template-contract.md §3). NULL = belum dideklarasikan.
ALTER TABLE website_templates
  ADD COLUMN IF NOT EXISTS manifest JSONB NULL;

-- Daftar minat "Kabari saya" untuk profile berstatus coming_soon.
CREATE TABLE IF NOT EXISTS business_profile_waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  business_profile VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_business_profile_waitlist_user_profile UNIQUE (user_id, business_profile)
);

CREATE INDEX IF NOT EXISTS idx_business_profile_waitlist_profile
  ON business_profile_waitlist(business_profile);
