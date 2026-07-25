-- Migration 0016: Agent Kernel Tabloları
-- Agent Memory, Telemetri ve Trace için D1 şeması

-- ── Episodik Hafıza ──────────────────────────────────────────────────────────
-- Kullanıcının geçmiş sohbet özeti — keyword similarity retrieval için

CREATE TABLE IF NOT EXISTS agent_episodik_hafiza (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  kullanici_id      INTEGER NOT NULL,
  il                TEXT,
  ilce              TEXT,
  soru_ozeti        TEXT    NOT NULL,          -- İlk 200 karakter
  yanit_ozeti       TEXT    NOT NULL,          -- İlk 300 karakter
  anahtar_kelimeler TEXT    NOT NULL DEFAULT '[]', -- JSON string array
  tarih             INTEGER NOT NULL,          -- epoch ms
  onem_skoru        INTEGER NOT NULL DEFAULT 50,  -- 0-100
  FOREIGN KEY (kullanici_id) REFERENCES kullanicilar(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_episodik_kullanici_tarih
  ON agent_episodik_hafiza (kullanici_id, tarih DESC);

CREATE INDEX IF NOT EXISTS idx_episodik_lokasyon
  ON agent_episodik_hafiza (kullanici_id, il, ilce);

-- ── Agent Trace ──────────────────────────────────────────────────────────────
-- Her LLM isteği için tam span trace kaydı

CREATE TABLE IF NOT EXISTS agent_trace (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  trace_id     TEXT    NOT NULL UNIQUE,
  kullanici_id INTEGER NOT NULL,
  ozet         TEXT    NOT NULL,    -- JSON: spans, latency, model, araç sayısı
  olusturuldu  INTEGER NOT NULL,    -- epoch ms
  FOREIGN KEY (kullanici_id) REFERENCES kullanicilar(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_trace_kullanici
  ON agent_trace (kullanici_id, olusturuldu DESC);

-- TTL index: 30 günden eski trace'leri silmek için kullanılır
-- (cron job ile: DELETE FROM agent_trace WHERE olusturuldu < ?)
CREATE INDEX IF NOT EXISTS idx_agent_trace_olusturuldu
  ON agent_trace (olusturuldu);

-- ── Guardrail Log ────────────────────────────────────────────────────────────
-- Bloklanan ve uyarı verilen mesajların log'u

CREATE TABLE IF NOT EXISTS agent_guardrail_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  kullanici_id INTEGER,
  yon          TEXT    NOT NULL CHECK (yon IN ('input', 'output')),
  severity     TEXT    NOT NULL CHECK (severity IN ('block', 'warn', 'ok')),
  nedenler     TEXT    NOT NULL DEFAULT '[]',  -- JSON string array
  mesaj_ozeti  TEXT,                            -- İlk 100 karakter (maskelenmiş)
  tarih        INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_guardrail_log_tarih
  ON agent_guardrail_log (tarih DESC);

CREATE INDEX IF NOT EXISTS idx_guardrail_log_kullanici
  ON agent_guardrail_log (kullanici_id, tarih DESC);
