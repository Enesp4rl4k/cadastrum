-- 0017_poi_noktalari.sql
-- POI (Nokta İlgi) tablosu — OSB, havalimanı, liman, lojistik merkez
-- Kaynak: extension src/lib/data/{osblar,havalimanları,limanlar}.ts
-- Bir kez seed edilir, TUCBS'a sürekli istek gönderilmez.

CREATE TABLE IF NOT EXISTS poi_noktalari (
  id          TEXT    PRIMARY KEY,         -- slug: "osb-istanbul-ikitelli"
  kategori    TEXT    NOT NULL,            -- 'osb' | 'havalimanı' | 'liman' | 'lojistik'
  alt_tip     TEXT,                        -- osb: 'buyuk'|'orta'|'kucuk'|'ihtisas' / hava: 'uluslararasi'|'ic'
  ad          TEXT    NOT NULL,
  il          TEXT    NOT NULL,
  lat         REAL    NOT NULL,
  lng         REAL    NOT NULL,
  meta        TEXT,                        -- JSON: ekstra özellikler (IATA kodu, kapasite vb.)
  guncelleme  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Hızlı bbox sorgusu için spatial-ish index
CREATE INDEX IF NOT EXISTS idx_poi_kategori ON poi_noktalari(kategori);
CREATE INDEX IF NOT EXISTS idx_poi_il       ON poi_noktalari(il);
CREATE INDEX IF NOT EXISTS idx_poi_lat_lng  ON poi_noktalari(lat, lng);
