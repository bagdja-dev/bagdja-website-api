-- =============================================================
-- Fix: hapus websites.org_id — salah kaprah level tenant.
--
-- `org_id` di platform Bagdja adalah identitas B2B integrator/client-app
-- yang terdaftar di bagdja-auth (lihat core/bagdja-node-sdk ClientAppContext,
-- core/docs/service-security-guidelines.md), BUKAN batas kepemilikan resource
-- end-user. Kolom ini diisi dari header client mentah `x-org-id` (tidak
-- divalidasi, bisa dispoof) dan admin CMS tidak pernah mengirimnya — di
-- praktik semua baris jatuh ke fallback 'default'. Tidak pernah dipakai
-- untuk filter/otorisasi query manapun (TenantStaffGuard hanya cek
-- website_id + user_id via tenant_staff, yang memang sudah jadi batas
-- tenant yang sesungguhnya).
--
-- Pola yang benar: lihat app/bagdja-pos yang sengaja TIDAK memakai org_id
-- sama sekali untuk kepemilikan (plan.md bagdja-pos, bagian "Batasan
-- Prinsip Arsitektur" no. 2).
-- =============================================================

ALTER TABLE websites DROP COLUMN IF EXISTS org_id;
