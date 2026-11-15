-- Jadwal jasa di kalender: disalin dari field flow bertipe tanggal yang ditandai `calendar_role`
-- (start/end) setiap kali langkah fulfillment dikirim (praorder maupun pascaorder).
-- Kalender membaca kolom ini (ber-indeks), bukan isian form per flow.

ALTER TABLE website_orders
  ADD COLUMN IF NOT EXISTS scheduled_start_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS scheduled_end_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS scheduled_all_day boolean NOT NULL DEFAULT false;

ALTER TABLE website_orders DROP CONSTRAINT IF EXISTS chk_website_orders_schedule_range;
ALTER TABLE website_orders
  ADD CONSTRAINT chk_website_orders_schedule_range CHECK (
    scheduled_end_at IS NULL OR (scheduled_start_at IS NOT NULL AND scheduled_end_at >= scheduled_start_at)
  );

-- Kalender penjual (per website) & pembeli (per user) dalam rentang waktu.
CREATE INDEX IF NOT EXISTS idx_website_orders_schedule_website
  ON website_orders (website_id, scheduled_start_at)
  WHERE scheduled_start_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_website_orders_schedule_buyer
  ON website_orders (buyer_user_id, scheduled_start_at)
  WHERE scheduled_start_at IS NOT NULL;

COMMENT ON COLUMN website_orders.scheduled_start_at IS
  'Mulai jadwal jasa (dari field flow calendar_role=start). NULL = tidak terjadwal.';
COMMENT ON COLUMN website_orders.scheduled_end_at IS
  'Selesai jadwal jasa (field flow calendar_role=end), opsional.';
COMMENT ON COLUMN website_orders.scheduled_all_day IS
  'true bila jadwal berasal dari field tanggal (tanpa jam).';
