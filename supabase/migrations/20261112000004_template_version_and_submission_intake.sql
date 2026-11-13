-- Alur pendaftaran → review → publikasi → aktivasi template eksternal.
-- Plan: plan/website-builder/template-submission-review-publication-flow.md §3, §5.
--
-- 1. website_template_version: satu baris per versi terbit (template bisa punya banyak versi).
-- 2. website_templates: asal template (builtin/package) + kepemilikan slug oleh package.
-- 3. websites.template_version_id: pin versi eksplisit per website.
-- 4. website_platform_template_submissions: hasil "Cek package" + state machine baru.
--
-- Dijalankan SETELAH 20261112000003_template_publication_staging.sql.
-- Idempoten. Kolom publication_status TIDAK dihapus di sini (dipensiunkan, dihapus
-- dengan script terpisah setelah kode baru berjalan dan dikonfirmasi).

BEGIN;

-- ── 1. Versi template terbit ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS website_template_version (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES website_templates(id),
  version VARCHAR(100) NOT NULL,
  artifact_digest CHAR(64) NOT NULL CHECK (artifact_digest ~ '^[a-f0-9]{64}$'),
  manifest JSONB NOT NULL,
  submission_id UUID NOT NULL REFERENCES website_platform_template_submissions(id),
  status VARCHAR(20) NOT NULL DEFAULT 'published'
    CHECK (status IN ('published', 'deprecated', 'revoked')),
  status_note TEXT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_website_template_version_template_version UNIQUE (template_id, version),
  CONSTRAINT uq_website_template_version_submission UNIQUE (submission_id)
);

CREATE INDEX IF NOT EXISTS idx_website_template_version_catalog
  ON website_template_version(template_id, status, published_at DESC);

-- ── 2. Asal template & kepemilikan slug ──────────────────────────────────
ALTER TABLE website_templates
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'builtin',
  ADD COLUMN IF NOT EXISTS package_name VARCHAR(214) NULL,
  ADD COLUMN IF NOT EXISTS designer_user_id UUID NULL;

ALTER TABLE website_templates
  DROP CONSTRAINT IF EXISTS website_templates_source_check;
ALTER TABLE website_templates
  ADD CONSTRAINT website_templates_source_check
  CHECK (
    (source = 'builtin' AND package_name IS NULL)
    OR (source = 'package' AND package_name IS NOT NULL AND designer_user_id IS NOT NULL)
  ) NOT VALID;

-- ── 3. Pin versi per website ─────────────────────────────────────────────
ALTER TABLE websites
  ADD COLUMN IF NOT EXISTS template_version_id UUID NULL
    REFERENCES website_template_version(id);

CREATE INDEX IF NOT EXISTS idx_websites_template_version
  ON websites(template_version_id)
  WHERE template_version_id IS NOT NULL;

COMMENT ON COLUMN websites.template_version_id IS
  'Versi template eksternal yang dipasang seller. Hanya berubah lewat aksi pasang/update eksplisit. NULL = template bawaan.';
COMMENT ON COLUMN websites.template_runtime_version IS
  'Salinan website_template_version.version untuk renderer (sementara). Ikut template_version_id.';

-- ── 4. Submission: hasil cek + state machine ─────────────────────────────
ALTER TABLE website_platform_template_submissions
  ADD COLUMN IF NOT EXISTS tarball_integrity TEXT NULL,
  ADD COLUMN IF NOT EXISTS candidate_digest CHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS manifest JSONB NULL,
  ADD COLUMN IF NOT EXISTS check_report JSONB NULL,
  ADD COLUMN IF NOT EXISTS checked_at TIMESTAMPTZ NULL;

-- Nama & slug sekarang dibaca dari manifest saat "Cek package", jadi kosong selama draft.
ALTER TABLE website_platform_template_submissions
  ALTER COLUMN name DROP NOT NULL,
  ALTER COLUMN slug DROP NOT NULL;

ALTER TABLE website_platform_template_submissions
  DROP CONSTRAINT IF EXISTS website_platform_template_submissions_status_check;

-- Backfill status lama ke state machine baru (sebelum CHECK baru dipasang):
--   approved + published                → published
--   approved + withdrawn                → revoked
--   approved / submitted / in_review lainnya (termasuk publication_status 'staged')
--                                       → draft: belum punya artefak kandidat hasil intake
--                                         (candidates/), designer perlu "Cek package" lalu
--                                         mengajukan ulang. Riwayat tetap ada di audit log.
UPDATE website_platform_template_submissions
SET status = 'published'
WHERE status = 'approved' AND publication_status = 'published';

UPDATE website_platform_template_submissions
SET status = 'revoked'
WHERE status = 'approved' AND publication_status = 'withdrawn';

UPDATE website_platform_template_submissions
SET status = 'draft',
    submitted_at = NULL,
    reviewed_at = NULL,
    reviewer_user_id = NULL
WHERE status IN ('approved', 'submitted', 'in_review');

ALTER TABLE website_platform_template_submissions
  ADD CONSTRAINT website_platform_template_submissions_status_check
  CHECK (status IN (
    'draft', 'checking', 'check_failed', 'checked',
    'submitted', 'in_review', 'changes_requested', 'rejected',
    'publishing', 'publish_failed', 'published', 'deprecated', 'revoked'
  ));

COMMENT ON COLUMN website_platform_template_submissions.publication_status IS
  'DEPRECATED 12 Nov 2026 — digantikan status. Akan dihapus dengan script terpisah.';

-- ── 5. Backfill versi yang sudah terbit lewat alur lama ──────────────────
-- Template eksternal lama tersimpan dengan manifest.isBuiltin = false.
UPDATE website_templates t
SET source = 'package',
    package_name = s.package_name,
    designer_user_id = s.designer_user_id
FROM website_platform_template_submissions s
WHERE t.manifest ->> 'isBuiltin' = 'false'
  AND t.slug = s.slug
  AND s.status IN ('published', 'revoked')
  AND t.source = 'builtin';

INSERT INTO website_template_version
  (template_id, version, artifact_digest, manifest, submission_id, status, published_at)
SELECT t.id,
       s.package_version,
       s.artifact_digest,
       t.manifest,
       s.id,
       CASE WHEN s.status = 'revoked' THEN 'revoked' ELSE 'published' END,
       COALESCE(s.published_at, s.updated_at)
FROM website_platform_template_submissions s
JOIN website_templates t ON t.slug = s.slug AND t.source = 'package'
WHERE s.status IN ('published', 'revoked')
  AND s.artifact_digest IS NOT NULL
ON CONFLICT DO NOTHING;

UPDATE websites w
SET template_version_id = v.id
FROM website_template_version v
WHERE w.template_id = v.template_id
  AND w.template_runtime_version = v.version
  AND w.template_version_id IS NULL;

COMMIT;
