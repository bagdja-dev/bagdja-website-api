-- Uji template kandidat (belum terbit) di website sungguhan.
-- Plan: plan/website-builder/template-candidate-trial-plan.md §3.
--
-- Pin publik website (template_id, template_version_id) tidak berubah selama uji;
-- kandidat hanya dirender untuk designer/reviewer yang berhak dan sedang login.

ALTER TABLE websites
  ADD COLUMN IF NOT EXISTS trial_submission_id uuid NULL
    REFERENCES website_platform_template_submissions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_websites_trial_submission_id
  ON websites (trial_submission_id)
  WHERE trial_submission_id IS NOT NULL;

COMMENT ON COLUMN websites.trial_submission_id IS
  'Pengajuan template yang sedang diuji di website ini (hanya terlihat oleh designer/reviewer yang berhak).';
