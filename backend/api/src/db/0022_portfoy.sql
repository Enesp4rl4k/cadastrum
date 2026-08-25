-- 0022_portfoy.sql
-- Portföy tablosu: kullanıcı kayıtlı parselleri sunucuda sakla (multi-device sync)
-- Pro tier özelliği — karsilastirma-store.tsx'teki chrome.storage'ı tamamlar

CREATE TABLE IF NOT EXISTS portfoy (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  kullanici_id  INTEGER NOT NULL REFERENCES kullanicilar(id) ON DELETE CASCADE,
  parsel_key    TEXT    NOT NULL,  -- "{mahalleKodu}:{adaNo}:{parselNo}"
  il_ad         TEXT,
  ilce_ad       TEXT,
  mahalle_ad    TEXT,
  ada_no        TEXT,
  parsel_no     TEXT,
  nitelik       TEXT,
  alan_m2       REAL,
  lat           REAL,
  lng           REAL,
  fiyat_tahmini INTEGER,           -- TL beklenen değer (son hesaplama)
  not_metni     TEXT,
  etiket        TEXT,              -- "firsat" | "izleme" | "sahip" | null
  eklendi       INTEGER NOT NULL DEFAULT (unixepoch()),
  guncellendi   INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(kullanici_id, parsel_key)
);

CREATE INDEX IF NOT EXISTS idx_portfoy_kullanici ON portfoy(kullanici_id);
CREATE INDEX IF NOT EXISTS idx_portfoy_eklendi   ON portfoy(kullanici_id, eklendi DESC);
