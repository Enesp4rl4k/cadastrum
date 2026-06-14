-- Faz 2 — Spatial emsal motoru için koordinat alanları.
--
-- ilanlar tablosuna lat/lng ekler. Eski kayıtlar NULL kalır; client
-- (extension) yeni POST'larda lat/lng dolu gönderir, server-side
-- 3 ondalık quantize edilir (K-anonymity ~110m).
--
-- Index stratejisi:
--   * (lat, lng) composite — bbox prefilter (`WHERE lat BETWEEN ? AND ?`)
--   * (kategori, lat, lng) — kategori bazlı spatial sorgu sık
--   * (il_norm, lat, lng) — il bazlı zoom-in için
--
-- Çalıştır:
--   wrangler d1 execute cadastrum --file=src/db/0007_spatial.sql --remote
--   wrangler d1 execute cadastrum --file=src/db/0007_spatial.sql --local

ALTER TABLE ilanlar ADD COLUMN lat REAL;
ALTER TABLE ilanlar ADD COLUMN lng REAL;
ALTER TABLE ilanlar ADD COLUMN koord_kaynagi TEXT;  -- 'dom' | 'mahalle-merkez' | 'manuel'

CREATE INDEX IF NOT EXISTS idx_ilanlar_latlng ON ilanlar(lat, lng);
CREATE INDEX IF NOT EXISTS idx_ilanlar_kategori_latlng ON ilanlar(kategori, lat, lng);
CREATE INDEX IF NOT EXISTS idx_ilanlar_il_latlng ON ilanlar(il_norm, lat, lng);
