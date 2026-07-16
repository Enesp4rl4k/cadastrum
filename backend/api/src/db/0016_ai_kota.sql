-- Migration 0016: ai_kullanim tablosuna gun+sayi rate-limit kolonları ekle
-- ai-fiyat.ts günlük kota için (kullanici_id, gun) unique key ile çalışıyor.
-- Mevcut tablo log amaçlı (her sorgu ayrı satır); yeni tablo günlük bucket sayacı.

-- Eski ai_kullanim tablosu log olarak kalsın (tarihsel veri).
-- Yeni ai_kullanim_kota tablosu rate limit için.
CREATE TABLE IF NOT EXISTS ai_kullanim_kota (
  kullanici_id  INTEGER NOT NULL,
  gun           INTEGER NOT NULL,   -- epoch / 86400000 (gün bucket)
  sayi          INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (kullanici_id, gun),
  FOREIGN KEY (kullanici_id) REFERENCES kullanicilar(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_kota_uid_gun
  ON ai_kullanim_kota(kullanici_id, gun);
