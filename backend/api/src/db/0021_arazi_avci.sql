-- Arazi Avcısı — kayıtlı kriter + uyarı sistemi
-- Faz A3/A4

-- Kullanıcının kayıtlı arama kriterleri
CREATE TABLE IF NOT EXISTS arazi_avci_kriter (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  kullanici_id    INTEGER NOT NULL REFERENCES kullanicilar(id) ON DELETE CASCADE,
  ad              TEXT NOT NULL,                     -- "İstanbul çevresi tarla"
  il_norm         TEXT,                              -- NULL = tüm Türkiye
  ilce_norm       TEXT,
  kategori        TEXT NOT NULL DEFAULT 'arsa',      -- arsa | tarla | konut
  imar_tipi       TEXT,                              -- konut | ticari | sanayi | tarim | karma
  min_m2          REAL,
  max_m2          REAL,
  min_fiyat       REAL,                              -- toplam TL
  max_fiyat       REAL,
  max_tlm2        REAL,                              -- TL/m² tavan
  min_skor        INTEGER DEFAULT 0,                 -- min yatırım skoru (0-100)
  uyari_aktif     INTEGER NOT NULL DEFAULT 1,        -- 0=kapalı, 1=açık
  son_uyari       INTEGER,                           -- son email uyarısı ts (ms)
  son_sonuc_adet  INTEGER,                           -- son taramadaki eşleşme sayısı
  olusturuldu     INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
  guncellendi     INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_avci_kriter_kullanici ON arazi_avci_kriter(kullanici_id);
CREATE INDEX IF NOT EXISTS idx_avci_kriter_uyari ON arazi_avci_kriter(uyari_aktif) WHERE uyari_aktif = 1;

-- Avcı arama geçmişi (cache + analytics)
CREATE TABLE IF NOT EXISTS arazi_avci_arama (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  kullanici_id  INTEGER REFERENCES kullanicilar(id) ON DELETE SET NULL,
  kriter_id     INTEGER REFERENCES arazi_avci_kriter(id) ON DELETE SET NULL,
  filtre_json   TEXT NOT NULL,                   -- arama parametreleri JSON
  sonuc_adet    INTEGER NOT NULL DEFAULT 0,
  arama_tarihi  INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_avci_arama_tarih ON arazi_avci_arama(arama_tarihi DESC);
