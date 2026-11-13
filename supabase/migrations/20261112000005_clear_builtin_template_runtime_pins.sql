-- Bersihkan pin runtime sisa uji manual pada website bertemplate BAWAAN.
--
-- Latar: sebelum alur publikasi package, website `store-classic` bawaan sempat diberi
-- `template_runtime_version` (mis. '1.0.7') agar dirender artefak eksternal bernama sama.
-- Sejak 12 Nov 2026 API & renderer mengabaikan pin pada template bawaan
-- (src/modules/public/template-runtime-resolution.ts), jadi script ini hanya merapikan data.
--
-- Cek dulu baris yang terdampak:
--   SELECT w.slug, t.slug AS template, w.template_runtime_version
--   FROM websites w JOIN website_templates t ON t.id = w.template_id
--   WHERE t.source = 'builtin' AND w.template_runtime_version IS NOT NULL;

UPDATE websites w
SET template_runtime_version = NULL,
    template_version_id = NULL
FROM website_templates t
WHERE t.id = w.template_id
  AND t.source = 'builtin'
  AND (w.template_runtime_version IS NOT NULL OR w.template_version_id IS NOT NULL);
