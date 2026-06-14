-- Migration 0014: Otomatik scraper run logu.
-- Aylık cron + manuel admin trigger için.
--
-- Çalıştır:
--   npx wrangler d1 execute cadastrum-db --remote --file="src/db/0014_scraper_run.sql"

CREATE TABLE IF NOT EXISTS scraper_run (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  baslangic       INTEGER NOT NULL,
  bitis           INTEGER,
  tetik           TEXT NOT NULL,     -- 'cron-aylik' | 'manuel-admin'
  islenen_ilce    INTEGER NOT NULL DEFAULT 0,
  toplam_link     INTEGER NOT NULL DEFAULT 0,
  toplam_insert   INTEGER NOT NULL DEFAULT 0,
  bot_engel_adet  INTEGER NOT NULL DEFAULT 0,
  hata_adet       INTEGER NOT NULL DEFAULT 0,
  durum           TEXT NOT NULL DEFAULT 'calisiyor',  -- 'calisiyor' | 'tamam' | 'hata' | 'bot-bloke'
  son_hata        TEXT,
  detay_json      TEXT               -- istatistik detay (per-ilce sayılar vb.)
);

CREATE INDEX IF NOT EXISTS idx_scraper_run_baslangic ON scraper_run(baslangic DESC);

-- Scraper checkpoint — kaldığı yerden devam için
-- Her ilçe için son tarama timestamp; cron sırayla en eski ilçeden başlar.
CREATE TABLE IF NOT EXISTS scraper_ilce_durum (
  il_norm          TEXT NOT NULL,
  ilce_norm        TEXT NOT NULL,
  kategori         TEXT NOT NULL,     -- 'arsa' | 'tarla'
  son_tarama       INTEGER,
  son_insert_adet  INTEGER NOT NULL DEFAULT 0,
  son_durum        TEXT,              -- 'tamam' | 'bot-engel' | 'hata'
  PRIMARY KEY (il_norm, ilce_norm, kategori)
);

CREATE INDEX IF NOT EXISTS idx_scraper_ilce_son_tarama ON scraper_ilce_durum(son_tarama ASC);
