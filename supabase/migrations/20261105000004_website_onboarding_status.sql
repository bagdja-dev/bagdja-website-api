-- Studio S2 — Beranda "Siapkan website kamu" (template-contract.md §1.3,
-- GET /api/websites/:websiteId/onboarding-status).
--
-- 1) website_sections.is_seed
--    TRUE  = section dibuat otomatis dari template saat bootstrap website dan
--            belum pernah diubah isinya.
--    FALSE = section dibuat user, atau section seed yang `type`/`content`-nya
--            sudah diubah lewat PATCH sections (SectionsService.update).
--    `homeEdited` = ada section di halaman Home dengan is_seed = FALSE.
--
--    BACKFILL (hanya sekali, saat kolom baru ditambahkan): section yang sudah
--    ada ditandai is_seed = TRUE bila memenuhi heuristik lama Beranda, yaitu
--    tidak pernah diubah (updated_at - created_at <= 1 menit) DAN dibuat
--    <= 10 menit setelah website dibuat (= hasil bootstrap). Sisanya FALSE
--    (dianggap sudah disesuaikan user). Trigger updated_at dimatikan selama
--    backfill supaya timestamp asli tidak berubah. Dijalankan di dalam blok
--    "kolom belum ada" → file ini aman dijalankan ulang (idempotent) tanpa
--    menandai ulang section yang sudah diedit.
--
-- 2) websites.link_shared_at
--    Kapan owner/staff pertama kali menyalin link website dari Beranda
--    (POST /api/websites/:websiteId/onboarding-status/link-shared, idempotent:
--    hanya diisi bila masih NULL). Website lama = NULL (belum dibagikan) —
--    tidak di-backfill karena tidak ada sumber data yang bisa dipercaya
--    (sebelumnya hanya di localStorage browser).
--
-- PENTING: jalankan file ini SEBELUM men-deploy API versi ini — entity
-- TypeORM sudah memetakan kedua kolom, query website/section akan gagal bila
-- kolom belum ada.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'website_sections'
      AND column_name = 'is_seed'
  ) THEN
    ALTER TABLE website_sections
      ADD COLUMN is_seed BOOLEAN NOT NULL DEFAULT FALSE;

    ALTER TABLE website_sections DISABLE TRIGGER trg_website_sections_updated_at;

    UPDATE website_sections s
    SET is_seed = TRUE
    FROM website_pages p
    JOIN websites w ON w.id = p.website_id
    WHERE s.page_id = p.id
      AND s.updated_at - s.created_at <= INTERVAL '1 minute'
      AND s.created_at - w.created_at <= INTERVAL '10 minutes';

    ALTER TABLE website_sections ENABLE TRIGGER trg_website_sections_updated_at;
  END IF;
END $$;

COMMENT ON COLUMN website_sections.is_seed IS
  'TRUE = section contoh dari template (bootstrap) yang belum diubah; FALSE = dibuat/diubah user. Dipakai onboarding-status.homeEdited.';

ALTER TABLE websites
  ADD COLUMN IF NOT EXISTS link_shared_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN websites.link_shared_at IS
  'Pertama kali link website disalin dari Studio Beranda (checklist "Bagikan link website"). NULL = belum.';
