-- AI Scorecard cache tablosu
-- Migration: 0018_ai_scorecard_cache.sql

CREATE TABLE IF NOT EXISTS ai_scorecard_cache (
  parsel_anahtar TEXT PRIMARY KEY,
  skorlar        TEXT    NOT NULL,  -- JSON: {tarimsal, yapilasmа, lojistik, enerji, risk}
  genel_skor     REAL    NOT NULL,
  ozet           TEXT    NOT NULL,
  model          TEXT    NOT NULL,
  sure_ms        INTEGER NOT NULL,
  olusturuldu    INTEGER NOT NULL
);

-- Eski cache'leri temizlemek için index (istatistik refresh sırasında kullanılır)
CREATE INDEX IF NOT EXISTS idx_ai_scorecard_cache_olusturuldu
  ON ai_scorecard_cache (olusturuldu);
