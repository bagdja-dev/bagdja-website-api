-- Custom domain: verifikasi kepemilikan via DNS TXT record sebelum domain dianggap aktif
ALTER TABLE websites
  ADD COLUMN IF NOT EXISTS domain_verification_token VARCHAR(64),
  ADD COLUMN IF NOT EXISTS domain_verified_at TIMESTAMPTZ;

-- Dua tenant tidak boleh klaim domain custom yang sama (domain nullable, jadi partial index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_websites_domain_unique ON websites(domain) WHERE domain IS NOT NULL;

COMMENT ON COLUMN websites.domain_verification_token IS 'Token acak untuk TXT record _bagdja-verify.<domain> — bukti kepemilikan domain';
COMMENT ON COLUMN websites.domain_verified_at IS 'Waktu domain custom berhasil diverifikasi (TXT record cocok + berhasil didaftarkan ke Coolify). NULL = belum aktif.';
