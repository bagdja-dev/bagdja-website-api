-- Tim penguji milik designer: akun yang ikut melihat & bertransaksi di versi uji template
-- designer itu (plan/website-builder/template-candidate-trial-plan.md §2.2, U1–U5).
-- Penguji dikenali dari email login (tanpa langkah terima undangan).

CREATE TABLE IF NOT EXISTS website_platform_template_tester (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  designer_user_id uuid NOT NULL,
  email varchar(320) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_website_platform_template_tester_email_lower CHECK (email = lower(email))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_website_platform_template_tester_designer_email
  ON website_platform_template_tester (designer_user_id, email);

CREATE INDEX IF NOT EXISTS idx_website_platform_template_tester_email
  ON website_platform_template_tester (email);

COMMENT ON TABLE website_platform_template_tester IS
  'Penguji yang diundang designer untuk mencoba versi uji template di website sungguhan.';
