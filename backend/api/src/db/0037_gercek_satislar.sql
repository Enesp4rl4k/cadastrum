-- Migration 0037: gercek_satislar tablosu — kullanıcı gerçek satış feedback loop.
--
-- Kullanıcı bir parseli satın aldıktan veya sattıktan sonra gerçek fiyatı girer.
-- Veri anonim: mahalle bazlı, parsel no / koordinat saklanmaz.
-- Sonraki adım: bias kalibrasyon scripti bu tabloyu okur, mahalle offset hesaplar.
--
-- Not: Extension tarafındaki GercekFiyatKaydi Dexie'de zaten tutuluyor.
-- Bu tablo backend'e gönderilen anonim özeti barındırır — tam payload değil.

CREATE TABLE IF NOT EXISTS gercek_satislar (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Konum (normalize edilmiş, küçük harf)
  il_norm           TEXT NOT NULL,
  ilce_norm         TEXT NOT NULL,
  mahalle_norm      TEXT NOT NULL DEFAULT '',
  -- Fiyat
  gercek_per_m2     REAL NOT NULL,         -- TL/m²
  alan_bant         TEXT NOT NULL,          -- '<250m²' | '250-1000m²' | ... (kesin alan gönderilmez)
  -- Metadata
  tip               TEXT NOT NULL DEFAULT 'bilgi',  -- 'satin-alindi' | 'satildi' | 'bilgi'
  tahmin_goruldu    INTEGER NOT NULL DEFAULT 0,      -- 0/1 — kullanıcı modelin tahminini gördü mü?
  heuristic_per_m2  REAL,                  -- Modelin o anki tahmini (karşılaştırma için)
  giris_tarihi      INTEGER NOT NULL,      -- Extension'daki giriş zamanı (ms)
  yakalanma_tarihi  INTEGER NOT NULL       -- Backend'e ulaştığı zaman (ms)
);

-- Mahalle bazlı bias sorgusu için
CREATE INDEX IF NOT EXISTS idx_gercek_satislar_konum
  ON gercek_satislar (il_norm, ilce_norm, mahalle_norm);

-- Zaman bazlı sorgular için
CREATE INDEX IF NOT EXISTS idx_gercek_satislar_tarih
  ON gercek_satislar (yakalanma_tarihi);
