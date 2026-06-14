-- Faz 5 Sprint I — CRM Lite (müşteri-parsel atama).
--
-- Kurumsal Standart+ tier. Free/Bireysel için endpoint 403 döner.
--
-- Çalıştır:
--   wrangler d1 execute cadastrum --file=src/db/0011_crm.sql --remote
--   wrangler d1 execute cadastrum --file=src/db/0011_crm.sql --local

CREATE TABLE IF NOT EXISTS musteri (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  sahip_id      INTEGER NOT NULL,           -- bu kullanıcının müşterisi (multi-user için)
  ad            TEXT NOT NULL,
  telefon       TEXT,
  email         TEXT,
  notlar        TEXT,
  etiketler     TEXT,                       -- virgülle ayrılmış
  olusturuldu   INTEGER NOT NULL,
  guncellendi   INTEGER NOT NULL,
  FOREIGN KEY (sahip_id) REFERENCES kullanicilar(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_musteri_sahip ON musteri(sahip_id);

CREATE TABLE IF NOT EXISTS musteri_parsel (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  musteri_id    INTEGER NOT NULL,
  -- Parsel kimlikleri (TKGM'den)
  il_norm       TEXT,
  ilce_norm     TEXT,
  mahalle_norm  TEXT,
  ada_no        INTEGER,
  parsel_no     INTEGER,
  alan_m2       REAL,
  -- Snapshot fiyat tahmin (atama anındaki)
  fiyat_tahmin_tlm2  REAL,
  not_text      TEXT,
  durum         TEXT NOT NULL DEFAULT 'aktif',   -- 'aktif' | 'satildi' | 'iptal'
  olusturuldu   INTEGER NOT NULL,
  FOREIGN KEY (musteri_id) REFERENCES musteri(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_musteri_parsel_m ON musteri_parsel(musteri_id);
CREATE INDEX IF NOT EXISTS idx_musteri_parsel_loc ON musteri_parsel(il_norm, ilce_norm, mahalle_norm);

-- Müşteri notu timeline — kronolojik takip
CREATE TABLE IF NOT EXISTS musteri_not (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  musteri_id    INTEGER NOT NULL,
  parsel_atama_id INTEGER,                  -- nullable: genel müşteri notu
  metin         TEXT NOT NULL,
  ts            INTEGER NOT NULL,
  FOREIGN KEY (musteri_id) REFERENCES musteri(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_musteri_not_m ON musteri_not(musteri_id, ts DESC);
