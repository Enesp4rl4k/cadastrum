-- Migration 0029: Hepsiemlak ilçe tarama durumu
--
-- NEDEN AYRI TABLO: scraper_ilce_durum'un birincil anahtarı
-- (il_norm, ilce_norm, kategori) ve kaynak boyutu yok. Hepsiemlak'ı aynı
-- tabloya koymak emlakjet'in rotasyonuyla çakışırdı (aynı ilçe iki kaynak
-- için de "tarandı" sayılırdı). SQLite'ta birincil anahtar değiştirmek tablo
-- yeniden kurmayı gerektirdiğinden, mevcut 1946 satırlık emlakjet rotasyonunu
-- riske atmak yerine ayrı tablo tercih edildi.
--
-- Rotasyon mantığı emlakjet ile aynı: cron her turda son_tarama'sı en eski
-- (NULL en önce) ilçeleri seçer, tarar, damgalar.

CREATE TABLE IF NOT EXISTS hepsiemlak_ilce_durum (
  il_norm         TEXT NOT NULL,
  ilce_norm       TEXT NOT NULL,
  son_tarama      INTEGER,
  son_eklenen     INTEGER NOT NULL DEFAULT 0,
  son_durum       TEXT,
  PRIMARY KEY (il_norm, ilce_norm)
);

CREATE INDEX IF NOT EXISTS idx_he_ilce_son_tarama
  ON hepsiemlak_ilce_durum(son_tarama ASC);
