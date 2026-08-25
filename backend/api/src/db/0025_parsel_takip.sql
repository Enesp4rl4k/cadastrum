-- Parsel Polygon Snapshot — haftalık değişiklik tespiti için
-- Scheduler: "0 5 * * 1" (Pazartesi 05:00 UTC)

CREATE TABLE IF NOT EXISTS parsel_snapshots (
  parsel_key    TEXT NOT NULL,        -- "{mahalleKodu}:{adaNo}:{parselNo}"
  kullanici_id  INTEGER NOT NULL,     -- hangi kullanıcının favorisi
  alan_m2       REAL,                 -- son bilinen alan
  polygon_hash  TEXT,                 -- WKT polygon → SHA-256 (değişim tespiti)
  nitelik       TEXT,                 -- son bilinen tapu niteliği
  cekilen       INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (parsel_key, kullanici_id)
);

CREATE INDEX IF NOT EXISTS idx_parsel_snap_kullanici
  ON parsel_snapshots(kullanici_id);

-- Değişiklik log tablosu — bildirim geçmişi
CREATE TABLE IF NOT EXISTS parsel_degisiklik_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  parsel_key    TEXT NOT NULL,
  kullanici_id  INTEGER NOT NULL,
  degisiklik    TEXT NOT NULL,   -- "alan-degisimi" | "nitelik-degisimi" | "polygon-degisimi"
  onceki        TEXT,            -- eski değer (JSON)
  yeni          TEXT,            -- yeni değer (JSON)
  tespit_tarihi INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_parsel_deg_kullanici
  ON parsel_degisiklik_log(kullanici_id, tespit_tarihi DESC);
