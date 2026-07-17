-- Milli Emlak ihale sonuçları — gerçek tapu satış fiyatına en yakın açık kaynak.
--
-- Kaynak: mevduatlar.hazine.gov.tr / mülkiyet ihale sonuç listeleri
-- Güncelleme: aylık scripts/milli-emlak-scraper.mjs ile.
--
-- Bu tablo "listing price" değil, fiili ihale kapanış fiyatlarını tutar.
-- Fiyat motoru bu veriyi emsal olarak kullanır (en yüksek güven kaynağı).

CREATE TABLE IF NOT EXISTS milli_emlak_ihale (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Konum
  il_norm          TEXT NOT NULL,
  ilce_norm        TEXT NOT NULL,
  mahalle_norm     TEXT,
  -- Taşınmaz
  ada_no           TEXT,
  parsel_no        TEXT,
  m2               REAL,
  nitelik          TEXT,         -- arsa, tarla, bina, vb.
  -- Fiyat
  muhammen_bedel   REAL,         -- başlangıç fiyatı (TL)
  ihale_bedeli     REAL,         -- kapanış fiyatı (TL)
  fiyat_per_m2     REAL,         -- ihale_bedeli / m2
  -- Meta
  ihale_tarihi     INTEGER,      -- unix ms
  ihale_tipi       TEXT,         -- 'satis', 'kira', 'diger'
  kaynak_url       TEXT,
  yakalanma_tarihi INTEGER NOT NULL,
  aktif            INTEGER DEFAULT 1,
  -- Duplicate koruması
  UNIQUE(il_norm, ilce_norm, ada_no, parsel_no, ihale_tarihi)
);

-- Konum bazlı arama
CREATE INDEX IF NOT EXISTS idx_me_lokasyon
  ON milli_emlak_ihale(il_norm, ilce_norm, mahalle_norm);

-- Tarih bazlı filtreleme
CREATE INDEX IF NOT EXISTS idx_me_tarih
  ON milli_emlak_ihale(ihale_tarihi);

-- Fiyat motoru entegrasyonu — sadece aktif + satış ihaleleri
CREATE INDEX IF NOT EXISTS idx_me_aktif_satis
  ON milli_emlak_ihale(aktif, ihale_tipi, il_norm, ilce_norm);
