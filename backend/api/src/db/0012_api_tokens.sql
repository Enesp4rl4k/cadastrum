-- Faz 5 Sprint J — Public API token tablosu.
--
-- Kurumsal Pro tier'ı için programmatic erişim.
-- Token'lar hash'lenmiş saklanır (token_hash); ham token sadece oluşturulurken
-- bir kez döner. Kullanıcı kaybederse yenisini üretmeli.
--
-- Çalıştır:
--   wrangler d1 execute cadastrum --file=src/db/0012_api_tokens.sql --remote

CREATE TABLE IF NOT EXISTS api_tokens (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  kullanici_id      INTEGER NOT NULL,
  ad                TEXT NOT NULL,                -- kullanıcının verdiği etiket (ör. "prod backend")
  token_hash        TEXT NOT NULL UNIQUE,          -- SHA-256 hex
  token_prefix      TEXT NOT NULL,                 -- ilk 8 char + "..." (UI gösterimi için)
  rate_limit_per_min INTEGER NOT NULL DEFAULT 60,
  olusturuldu       INTEGER NOT NULL,
  son_kullanim      INTEGER,
  iptal_edildi      INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (kullanici_id) REFERENCES kullanicilar(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_api_tokens_user ON api_tokens(kullanici_id);
CREATE INDEX IF NOT EXISTS idx_api_tokens_hash ON api_tokens(token_hash);

-- Rate limit per token
CREATE TABLE IF NOT EXISTS api_token_rate (
  token_id          INTEGER NOT NULL,
  dakika            INTEGER NOT NULL,  -- floor(timestamp / 60000)
  istek_sayisi      INTEGER DEFAULT 0,
  PRIMARY KEY(token_id, dakika)
);
