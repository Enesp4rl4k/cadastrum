-- Haftalık portföy digest gönderim takip tablosu
-- Aynı kullanıcıya aynı haftada birden fazla email gönderilmesini önler.

CREATE TABLE IF NOT EXISTS haftalik_digest_gonderi (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  kullanici_id    INTEGER NOT NULL REFERENCES kullanicilar(id) ON DELETE CASCADE,
  gonderi_zamani  INTEGER NOT NULL,  -- Unix ms
  parsel_sayisi   INTEGER NOT NULL DEFAULT 0,
  -- Hızlı sorgu için index
  UNIQUE(kullanici_id, gonderi_zamani)  -- aynı hafta içinde tekrar girdi olmaz
);

CREATE INDEX IF NOT EXISTS idx_haftalik_digest_kullanici
  ON haftalik_digest_gonderi(kullanici_id);

CREATE INDEX IF NOT EXISTS idx_haftalik_digest_zaman
  ON haftalik_digest_gonderi(gonderi_zamani);

-- Kullanıcıların digest emailini kapatabilmesi için sütun ekle
-- (mevcut tabloda yoksa güvenli ALTER)
ALTER TABLE kullanicilar ADD COLUMN IF NOT EXISTS digest_kapali INTEGER DEFAULT 0;
