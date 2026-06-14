-- Migration: allow 'emlakjet' as ilanlar.kaynak
-- SQLite can't alter CHECK constraint; rebuild table.

PRAGMA foreign_keys=OFF;

CREATE TABLE IF NOT EXISTS ilanlar_new (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  kaynak           TEXT NOT NULL CHECK(kaynak IN ('sahibinden','hepsiemlak','extension','emlakjet')),
  ilan_no          TEXT NOT NULL,
  il_norm          TEXT NOT NULL,
  ilce_norm        TEXT NOT NULL,
  mahalle_norm     TEXT,
  fiyat_per_m2     REAL NOT NULL CHECK(fiyat_per_m2 > 0),
  m2               REAL,
  para_birimi      TEXT DEFAULT 'TL',
  kategori         TEXT NOT NULL CHECK(kategori IN ('arsa','tarla','konut','bahce','bag','zeytinlik','diger')),
  imar_durumu      TEXT,
  yakalanma_tarihi INTEGER NOT NULL,
  ilan_tarihi      INTEGER,
  aktif            INTEGER DEFAULT 1,
  lat              REAL,
  lng              REAL,
  koord_kaynagi    TEXT,
  dogrulama_sayisi INTEGER DEFAULT 0,
  guven_skoru      REAL DEFAULT 0.5,
  UNIQUE(kaynak, ilan_no)
);

INSERT INTO ilanlar_new (
  id, kaynak, ilan_no, il_norm, ilce_norm, mahalle_norm,
  fiyat_per_m2, m2, para_birimi, kategori, imar_durumu,
  yakalanma_tarihi, ilan_tarihi, aktif, lat, lng, koord_kaynagi,
  dogrulama_sayisi, guven_skoru
)
SELECT
  id, kaynak, ilan_no, il_norm, ilce_norm, mahalle_norm,
  fiyat_per_m2, m2, para_birimi, kategori, imar_durumu,
  yakalanma_tarihi, ilan_tarihi, aktif, lat, lng, koord_kaynagi,
  dogrulama_sayisi, guven_skoru
FROM ilanlar;

DROP TABLE ilanlar;
ALTER TABLE ilanlar_new RENAME TO ilanlar;

-- Recreate indexes if missing
CREATE INDEX IF NOT EXISTS idx_ilanlar_lokasyon ON ilanlar(il_norm, ilce_norm, mahalle_norm);
CREATE INDEX IF NOT EXISTS idx_ilanlar_tarih ON ilanlar(yakalanma_tarihi);
CREATE INDEX IF NOT EXISTS idx_ilanlar_kategori ON ilanlar(kategori, aktif);

PRAGMA foreign_keys=ON;
