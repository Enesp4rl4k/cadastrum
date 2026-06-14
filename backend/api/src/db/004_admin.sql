-- Admin dashboard migration
-- Run: wrangler d1 execute cadastrum --remote --file=src/db/004_admin.sql

-- Admin yetkisi (kullanicilar tablosuna kolon ekle, idempotent değil — sadece bir kere çalıştır)
ALTER TABLE kullanicilar ADD COLUMN admin INTEGER NOT NULL DEFAULT 0;

-- Admin denetim logu (audit trail) — kim ne zaman ne yaptı
CREATE TABLE IF NOT EXISTS admin_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id    INTEGER NOT NULL,
  olay        TEXT NOT NULL,            -- 'tier-degistir' | 'kullanici-ban' | 'kullanici-sil' | 'login'
  hedef_id    INTEGER,                  -- etkilenen kullanıcı id'si (varsa)
  payload     TEXT,                     -- JSON string (eski/yeni değer vs.)
  ip          TEXT,
  ts          INTEGER NOT NULL,
  FOREIGN KEY(admin_id) REFERENCES kullanicilar(id)
);
CREATE INDEX IF NOT EXISTS idx_admin_log_ts ON admin_log(ts DESC);
CREATE INDEX IF NOT EXISTS idx_admin_log_admin ON admin_log(admin_id, ts DESC);

-- Kullanıcı durumu (aktif/banlanmış/dondurulmuş)
ALTER TABLE kullanicilar ADD COLUMN durum TEXT NOT NULL DEFAULT 'aktif';
-- 'aktif' | 'banli' | 'dondurulmus'
