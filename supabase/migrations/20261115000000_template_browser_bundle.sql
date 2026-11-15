-- Client rendering template: browser.js per artefak kandidat, diunggah ke R2 sekali saat "Cek package".
-- Plan: plan/website-builder/template-client-rendering-plan.md §6 (D3, D6).
--
-- Kandidat menyimpan URL publik + SHA-256 browser.js; saat rilis keduanya disalin ke versi
-- (file yang sama, tanpa unggah ulang). NULL = template "rendering": "server" / artefak lama → SSR.

ALTER TABLE website_platform_template_submissions
  ADD COLUMN IF NOT EXISTS browser_bundle_url text NULL,
  ADD COLUMN IF NOT EXISTS browser_bundle_sha256 char(64) NULL;

ALTER TABLE website_template_version
  ADD COLUMN IF NOT EXISTS browser_bundle_url text NULL,
  ADD COLUMN IF NOT EXISTS browser_bundle_sha256 char(64) NULL;

ALTER TABLE website_platform_template_submissions
  DROP CONSTRAINT IF EXISTS chk_website_platform_template_submissions_browser_bundle;
ALTER TABLE website_platform_template_submissions
  ADD CONSTRAINT chk_website_platform_template_submissions_browser_bundle CHECK (
    (browser_bundle_url IS NULL AND browser_bundle_sha256 IS NULL)
    OR (browser_bundle_url ~ '^https?://' AND browser_bundle_sha256 ~ '^[a-f0-9]{64}$')
  );

ALTER TABLE website_template_version
  DROP CONSTRAINT IF EXISTS chk_website_template_version_browser_bundle;
ALTER TABLE website_template_version
  ADD CONSTRAINT chk_website_template_version_browser_bundle CHECK (
    (browser_bundle_url IS NULL AND browser_bundle_sha256 IS NULL)
    OR (browser_bundle_url ~ '^https?://' AND browser_bundle_sha256 ~ '^[a-f0-9]{64}$')
  );

COMMENT ON COLUMN website_platform_template_submissions.browser_bundle_url IS
  'URL publik (CDN/R2) browser.js artefak kandidat untuk client rendering; NULL = SSR.';
COMMENT ON COLUMN website_platform_template_submissions.browser_bundle_sha256 IS
  'SHA-256 hex browser.js; diverifikasi renderer sebelum dijalankan.';
COMMENT ON COLUMN website_template_version.browser_bundle_url IS
  'Disalin dari kandidat saat rilis (file R2 yang sama); NULL = SSR.';
COMMENT ON COLUMN website_template_version.browser_bundle_sha256 IS
  'SHA-256 hex browser.js versi ini.';
