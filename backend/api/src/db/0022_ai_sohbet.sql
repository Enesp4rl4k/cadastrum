-- AI Danışman sohbet geçmişi — Faz B3
CREATE TABLE IF NOT EXISTS ai_sohbet_gecmisi (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  kullanici_id     INTEGER NOT NULL REFERENCES kullanicilar(id) ON DELETE CASCADE,
  kullanici_mesaj  TEXT NOT NULL,
  asistan_yanit    TEXT NOT NULL,
  model            TEXT NOT NULL,
  sure_ms          INTEGER NOT NULL DEFAULT 0,
  tarih            INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_sohbet_kullanici ON ai_sohbet_gecmisi(kullanici_id, tarih DESC);
