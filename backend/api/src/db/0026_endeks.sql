-- 0026_endeks.sql — Cadex Fiyat Endeksi Tablosu

CREATE TABLE IF NOT EXISTS fiyat_endeksi (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  il_norm     TEXT NOT NULL,
  kategori    TEXT NOT NULL DEFAULT 'arsa',  -- arsa | tarla | konut
  yil         INTEGER NOT NULL,
  ay          INTEGER NOT NULL,              -- 1-12
  medyan      INTEGER NOT NULL,              -- TL/m²
  adet        INTEGER NOT NULL DEFAULT 0,
  baz_endeks  REAL,                          -- Ocak 2024 = 100 baz normalizasyonu
  hesaplandi  INTEGER DEFAULT (unixepoch()),
  UNIQUE(il_norm, kategori, yil, ay)
);

CREATE INDEX IF NOT EXISTS idx_endeks_il_kat ON fiyat_endeksi(il_norm, kategori, yil, ay);
CREATE INDEX IF NOT EXISTS idx_endeks_donem  ON fiyat_endeksi(yil, ay);
