-- Migration 0021: Webhook Idempotency Log
-- Çalıştır: wrangler d1 execute cadastrum-db --file=src/db/0021_webhook_idempotency.sql
--
-- LemonSqueezy webhook'ları zaman zaman tekrar gönderilebilir (retry).
-- Bu tablo her event'i idempotency_key ile kaydeder.
-- lemon.ts, işlemden önce bu tabloyu kontrol eder — aynı event ikinci kez işlenmez.

CREATE TABLE IF NOT EXISTS webhook_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  -- LemonSqueezy event ID (meta.event_id) — benzersiz per-delivery
  idempotency_key TEXT NOT NULL UNIQUE,
  -- Event adı (subscription_created vb.)
  event_name      TEXT NOT NULL,
  -- İşleme sonucu: 'ok' | 'skip' | 'hata'
  sonuc           TEXT NOT NULL DEFAULT 'ok',
  -- İşlem zamanı (epoch ms)
  islendi         INTEGER NOT NULL,
  -- Opsiyonel: hata mesajı veya özet
  -- NOT: sütun adı bilinçli olarak "notlar" — SQLite'ta "not" ayrılmış anahtar
  -- kelime, bare identifier olarak kullanılınca "near 'not': syntax error" veriyor
  -- (bu migration ilk denemede tam da bu yüzden production'a hiç uygulanamamıştı).
  notlar          TEXT
);

-- Temizleme için tarih index'i (90 günden eski log'lar silinebilir)
CREATE INDEX IF NOT EXISTS idx_webhook_log_islendi
  ON webhook_log(islendi);
