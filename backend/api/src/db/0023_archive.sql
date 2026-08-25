-- 0023: İlan archive tablosu + temizlik indeksi
--
-- Strateji: 18 aydan eski ilanlar `ilanlar` tablosundan `archive_ilanlar`'a taşınır.
-- Archive tablosu aynı şemaya sahip — sadece okunabilir, scraper'dan yeni kayıt almaz.
-- Taşıma: günlük cron ("0 4 * * *") ile 500 satır batch olarak yapılır.
-- Bu sayede D1 row count kontrolü altında tutulur (~10M limit).
--
-- Çalıştırma:
--   wrangler d1 execute cadastrum-db --file=src/db/0023_archive.sql --remote

-- Archive tablosu — ilanlar ile aynı şema
CREATE TABLE IF NOT EXISTS archive_ilanlar (
  id               INTEGER PRIMARY KEY,
  kaynak           TEXT NOT NULL,
  ilan_no          TEXT NOT NULL,
  il_norm          TEXT NOT NULL,
  ilce_norm        TEXT NOT NULL,
  mahalle_norm     TEXT,
  fiyat_per_m2     REAL NOT NULL,
  m2               REAL,
  para_birimi      TEXT DEFAULT 'TL',
  kategori         TEXT NOT NULL,
  imar_durumu      TEXT,
  yakalanma_tarihi INTEGER NOT NULL,
  ilan_tarihi      INTEGER,
  aktif            INTEGER DEFAULT 0,
  archive_tarihi   INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

-- Archive indeksleri
CREATE INDEX IF NOT EXISTS idx_archive_lokasyon ON archive_ilanlar(il_norm, ilce_norm, mahalle_norm);
CREATE INDEX IF NOT EXISTS idx_archive_tarih    ON archive_ilanlar(yakalanma_tarihi);
CREATE INDEX IF NOT EXISTS idx_archive_kategori ON archive_ilanlar(kategori);

-- Archive log — taşıma operasyonu kayıtları
CREATE TABLE IF NOT EXISTS archive_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  calistirilan INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  tasınan_adet INTEGER NOT NULL DEFAULT 0,
  en_eski_id   INTEGER,
  sure_ms      INTEGER
);
