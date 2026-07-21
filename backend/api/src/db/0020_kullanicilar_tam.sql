-- Cadastrum Auth Tabloları — idempotent migration
-- Çalıştır: wrangler d1 execute cadastrum-db --remote --file=src/db/0020_kullanicilar_tam.sql
--
-- Bu migration production'da kullanicilar + giris_denemesi tablolarını
-- yoksa oluşturur; varsa dokunmaz (IF NOT EXISTS).

-- ── Kullanıcılar (auth) ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kullanicilar (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  email           TEXT NOT NULL UNIQUE,
  ad              TEXT,
  pw_hash         TEXT NOT NULL,             -- PBKDF2-SHA256 hex
  pw_salt         TEXT NOT NULL,             -- random salt hex
  tier            TEXT NOT NULL DEFAULT 'free'
                    CHECK(tier IN ('free','pro','pro_plus','kurumsal')),
  tier_bitis      INTEGER,                   -- abonelik bitiş ts (null=süresiz/free)
  olusturuldu     INTEGER NOT NULL,
  son_giris       INTEGER,
  email_dogrulandi INTEGER NOT NULL DEFAULT 0,
  dogrulama_kod   TEXT,
  dogrulama_son   INTEGER,
  sifre_sifirla_token TEXT,
  sifre_sifirla_son   INTEGER,
  admin           INTEGER NOT NULL DEFAULT 0,
  durum           TEXT NOT NULL DEFAULT 'aktif'
                    CHECK(durum IN ('aktif','banli','dondurulmus'))
);

CREATE INDEX IF NOT EXISTS idx_kullanici_email ON kullanicilar(email);
CREATE INDEX IF NOT EXISTS idx_kullanici_tier  ON kullanicilar(tier);

-- ── Giriş denemesi (brute-force koruma) ──────────────────────────────────────
-- auth.ts: IP başına dakikada 10 giriş denemesi limiti
CREATE TABLE IF NOT EXISTS giris_denemesi (
  ip      TEXT NOT NULL,
  dakika  INTEGER NOT NULL,   -- floor(Date.now() / 60000)
  sayi    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(ip, dakika)
);

CREATE INDEX IF NOT EXISTS idx_giris_denemesi_dakika ON giris_denemesi(dakika);

-- ── Admin denetim logu ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_log (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id  INTEGER NOT NULL,
  olay      TEXT NOT NULL,
  hedef_id  INTEGER,
  payload   TEXT,
  ip        TEXT,
  ts        INTEGER NOT NULL,
  FOREIGN KEY(admin_id) REFERENCES kullanicilar(id)
);

CREATE INDEX IF NOT EXISTS idx_admin_log_ts    ON admin_log(ts DESC);
CREATE INDEX IF NOT EXISTS idx_admin_log_admin ON admin_log(admin_id, ts DESC);
