-- Faz 2 Sprint C — emsal doğrulama (kullanıcı 👍/👎 işaretleri).
--
-- guven_skoru spatial motor weight'inde kullanılır: yüksek doğrulanmış
-- emsaller daha fazla ağırlık alır.
--
-- Çalıştır:
--   wrangler d1 execute cadastrum --file=src/db/0008_dogrulama.sql --remote
--   wrangler d1 execute cadastrum --file=src/db/0008_dogrulama.sql --local

ALTER TABLE ilanlar ADD COLUMN dogrulama_sayisi INTEGER DEFAULT 0;
ALTER TABLE ilanlar ADD COLUMN guven_skoru REAL DEFAULT 0.5;

CREATE INDEX IF NOT EXISTS idx_ilanlar_guven ON ilanlar(guven_skoru DESC);
