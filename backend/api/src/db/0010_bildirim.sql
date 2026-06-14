-- Faz 4 Sprint G — bildirim sistemi.
--
-- bildirim_aboneligi: kullanıcı bir parsel/bölge için bildirim isteği oluşturur.
-- bildirim_gonderim_log: cron çalıştığında hangi aboneye ne gönderildi audit.
--
-- Bildirim tipleri:
--   'fiyat-degisimi' — bir mahalle/bölgenin medyan fiyatı %X+ değişti
--   'yeni-emsal'     — bir koord etrafında belirli adetin üzerinde yeni emsal
--   'esik-asildi'    — kullanıcının verdiği esik (TL/m²) altı/üstü emsal
--
-- parametre_json örnek:
--   { "lat": 41.0, "lng": 29.0, "radius_km": 3, "kategori": "arsa", "esik_yuzde": 5 }
--
-- Çalıştır:
--   wrangler d1 execute cadastrum --file=src/db/0010_bildirim.sql --remote
--   wrangler d1 execute cadastrum --file=src/db/0010_bildirim.sql --local

CREATE TABLE IF NOT EXISTS bildirim_aboneligi (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  kullanici_id  INTEGER NOT NULL,
  tip           TEXT NOT NULL CHECK(tip IN ('fiyat-degisimi','yeni-emsal','esik-asildi')),
  parametre_json TEXT NOT NULL,
  son_tetik     INTEGER,
  son_baseline  REAL,                          -- 'fiyat-degisimi' karşılaştırma için
  durum         TEXT NOT NULL DEFAULT 'aktif', -- 'aktif' | 'pasif'
  olusturuldu   INTEGER NOT NULL,
  FOREIGN KEY (kullanici_id) REFERENCES kullanicilar(id)
);

CREATE INDEX IF NOT EXISTS idx_bildirim_user ON bildirim_aboneligi(kullanici_id, durum);
CREATE INDEX IF NOT EXISTS idx_bildirim_aktif ON bildirim_aboneligi(durum, son_tetik);

CREATE TABLE IF NOT EXISTS bildirim_gonderim_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  abonelik_id   INTEGER NOT NULL,
  ts            INTEGER NOT NULL,
  tip           TEXT NOT NULL,
  ozet          TEXT,                          -- email konusu / kısa açıklama
  basarili      INTEGER NOT NULL DEFAULT 1,    -- 0 = email gönderim hatası
  FOREIGN KEY (abonelik_id) REFERENCES bildirim_aboneligi(id)
);

CREATE INDEX IF NOT EXISTS idx_bildirim_log_abonelik ON bildirim_gonderim_log(abonelik_id, ts DESC);
