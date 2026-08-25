-- API v2 Batch Jobs tablosu
-- Kurumsal POST /v2/batch endpoint'i için async job tracking

CREATE TABLE IF NOT EXISTS api_jobs (
  id            TEXT PRIMARY KEY,              -- UUID
  api_key_hash  TEXT NOT NULL,                  -- SHA-256 hash (sahiplik kontrolü)
  durum         TEXT NOT NULL DEFAULT 'bekliyor', -- bekliyor|isleniyor|tamamlandi|hata
  istek_sayisi  INTEGER NOT NULL DEFAULT 0,
  tamamlanan    INTEGER NOT NULL DEFAULT 0,
  hata_sayisi   INTEGER NOT NULL DEFAULT 0,
  sonuc_json    TEXT,                           -- tamamlanınca sonuçlar burada (<1MB)
  webhook_url   TEXT,                           -- opsiyonel callback URL
  olusturuldu   INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  tamamlandi_ts INTEGER
);

CREATE INDEX IF NOT EXISTS idx_api_jobs_key   ON api_jobs(api_key_hash);
CREATE INDEX IF NOT EXISTS idx_api_jobs_durum ON api_jobs(durum, olusturuldu);

-- 30 gün sonra otomatik temizlik için index (cron ile DELETE)
CREATE INDEX IF NOT EXISTS idx_api_jobs_eski  ON api_jobs(olusturuldu);
