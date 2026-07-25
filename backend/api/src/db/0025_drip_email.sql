-- Drip email gönderim takip tablosu
-- Kullanıcının hangi drip emailini aldığını takip eder (tekrar gönderme önleme).

CREATE TABLE IF NOT EXISTS drip_email_gonderi (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  kullanici_id    INTEGER NOT NULL REFERENCES kullanicilar(id) ON DELETE CASCADE,
  drip_kodu       TEXT NOT NULL,    -- 'd1-onboarding', 'd3-aihub', 'd7-pro'
  gonderi_zamani  INTEGER NOT NULL, -- Unix ms
  UNIQUE(kullanici_id, drip_kodu)
);

CREATE INDEX IF NOT EXISTS idx_drip_kullanici
  ON drip_email_gonderi(kullanici_id);

CREATE INDEX IF NOT EXISTS idx_drip_kod_zaman
  ON drip_email_gonderi(drip_kodu, gonderi_zamani);

-- Kullanıcıların drip emaillerini kapatabilmesi
ALTER TABLE kullanicilar ADD COLUMN IF NOT EXISTS drip_kapali INTEGER DEFAULT 0;
