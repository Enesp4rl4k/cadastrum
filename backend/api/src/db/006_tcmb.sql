-- TCMB EVDS Konut Fiyat Endeksi (KFE) cache
-- Run: npx wrangler d1 execute cadastrum-db --remote --file=src/db/006_tcmb.sql

CREATE TABLE IF NOT EXISTS tcmb_kfe_cache (
  il_norm        TEXT PRIMARY KEY,
  veri           TEXT NOT NULL,    -- JSON: { sonEndeks, sonTarih, trend[], ... }
  son_guncelleme INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tcmb_kfe_guncelleme ON tcmb_kfe_cache(son_guncelleme);
