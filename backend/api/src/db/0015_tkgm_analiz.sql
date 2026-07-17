-- TKGM analiz noktaları — tek seferlik seed, site haritası buradan okur.
-- Kaynak: cbsapi.tkgm.gov.tr/megsiswebapi.v3.1/api/analiz
-- Güncelleme: yılda bir kez scripts/tkgm-analiz-seed.mjs ile.

CREATE TABLE IF NOT EXISTS tkgm_analiz_noktalari (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ilce_kodu   INTEGER NOT NULL,
  analiz_tip  INTEGER NOT NULL,  -- 1=AlımSatım 2=AnaTS 3=AnaTSİpot 4=BBSatış 5=BBİpot
  yil         INTEGER NOT NULL,
  parsel_id   INTEGER NOT NULL,
  enlem       REAL    NOT NULL,
  boylam      REAL    NOT NULL,
  sayi        INTEGER NOT NULL DEFAULT 1,
  seed_at     INTEGER NOT NULL  -- epoch ms, seed zamanı
);

-- Birincil arama: ilçe + tip + yıl (harita tile sorgusu)
CREATE INDEX IF NOT EXISTS idx_tkgm_analiz_ilce_tip_yil
  ON tkgm_analiz_noktalari (ilce_kodu, analiz_tip, yil);

-- Duplicate seed koruması
CREATE UNIQUE INDEX IF NOT EXISTS idx_tkgm_analiz_unique
  ON tkgm_analiz_noktalari (ilce_kodu, analiz_tip, yil, parsel_id);

-- İlçe bazlı özet (aggregate endpoint için)
CREATE TABLE IF NOT EXISTS tkgm_analiz_ozet (
  ilce_kodu   INTEGER NOT NULL,
  analiz_tip  INTEGER NOT NULL,
  yil         INTEGER NOT NULL,
  nokta_sayisi INTEGER NOT NULL DEFAULT 0,
  toplam_islem INTEGER NOT NULL DEFAULT 0,
  seed_at     INTEGER NOT NULL,
  PRIMARY KEY (ilce_kodu, analiz_tip, yil)
);
