-- Perbaikan atas 20260919000001_vendor_availability.sql: kolom
-- website_orders.location_id/vendor_id ditambah via `ADD COLUMN ... REFERENCES`
-- tanpa klausa ON DELETE, jadi Postgres pakai default NO ACTION — padahal
-- entity TypeORM (website-order.entity.ts) mendeklarasikan onDelete:'SET NULL'
-- untuk keduanya. Konsekuensinya: hapus 1 Lokasi/Vendor yang masih dirujuk
-- order manapun (termasuk order lama/selesai) akan gagal dgn FK violation
-- (23503) yang tidak ditangani LocationsService/VendorsService — regresi
-- fitur hapus Lokasi yang sebelumnya berjalan normal.
--
-- Perbaikan: drop constraint auto-generated lalu re-create dengan
-- ON DELETE SET NULL, supaya perilaku DB sesuai yang sudah dideklarasikan
-- entity — bukan perubahan skema baru.

ALTER TABLE website_orders
  DROP CONSTRAINT IF EXISTS website_orders_location_id_fkey;

ALTER TABLE website_orders
  ADD CONSTRAINT website_orders_location_id_fkey
  FOREIGN KEY (location_id) REFERENCES website_locations(id) ON DELETE SET NULL;

ALTER TABLE website_orders
  DROP CONSTRAINT IF EXISTS website_orders_vendor_id_fkey;

ALTER TABLE website_orders
  ADD CONSTRAINT website_orders_vendor_id_fkey
  FOREIGN KEY (vendor_id) REFERENCES website_vendors(id) ON DELETE SET NULL;
