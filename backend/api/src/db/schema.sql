-- Cadastrum API D1 (SQLite) Schema
-- Çalıştır: npm run db:migrate (production) veya db:migrate-local (dev)

-- ── Ham ilan gözlemleri ──────────────────────────────────────────
-- Kaynak: extension kullanıcıları (opt-in) veya scraper
CREATE TABLE IF NOT EXISTS ilanlar (
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
  UNIQUE(kaynak, ilan_no)
);

CREATE INDEX IF NOT EXISTS idx_ilanlar_lokasyon ON ilanlar(il_norm, ilce_norm, mahalle_norm);
CREATE INDEX IF NOT EXISTS idx_ilanlar_tarih ON ilanlar(yakalanma_tarihi);
CREATE INDEX IF NOT EXISTS idx_ilanlar_kategori ON ilanlar(kategori, aktif);

-- ── Pre-computed mahalle istatistikleri (Cron ile yenilenir) ─────
CREATE TABLE IF NOT EXISTS mahalle_istatistik (
  il_norm        TEXT NOT NULL,
  ilce_norm      TEXT NOT NULL,
  mahalle_norm   TEXT NOT NULL,
  kategori       TEXT NOT NULL,
  medyan         REAL,
  q1             REAL,
  q3             REAL,
  ortalama       REAL,
  ilan_adet      INTEGER,
  son_guncelleme INTEGER,
  PRIMARY KEY(il_norm, ilce_norm, mahalle_norm, kategori)
);

-- ── İlçe istatistikleri ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ilce_istatistik (
  il_norm        TEXT NOT NULL,
  ilce_norm      TEXT NOT NULL,
  kategori       TEXT NOT NULL,
  medyan         REAL,
  q1             REAL,
  q3             REAL,
  ilan_adet      INTEGER,
  son_guncelleme INTEGER,
  PRIMARY KEY(il_norm, ilce_norm, kategori)
);

-- ── İl istatistikleri ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS il_istatistik (
  il_norm        TEXT NOT NULL,
  kategori       TEXT NOT NULL,
  medyan         REAL,
  ilan_adet      INTEGER,
  son_guncelleme INTEGER,
  PRIMARY KEY(il_norm, kategori)
);

-- ── Aylık zaman serisi (trend grafikleri için) ───────────────────
CREATE TABLE IF NOT EXISTS mahalle_zaman_serisi (
  il_norm        TEXT NOT NULL,
  ilce_norm      TEXT NOT NULL,
  mahalle_norm   TEXT NOT NULL,
  kategori       TEXT NOT NULL,
  yil            INTEGER NOT NULL,
  ay             INTEGER NOT NULL,
  medyan         REAL,
  ilan_adet      INTEGER,
  PRIMARY KEY(il_norm, ilce_norm, mahalle_norm, kategori, yil, ay)
);

-- ── Rate limiting (per IP per saat) ──────────────────────────────
CREATE TABLE IF NOT EXISTS rate_limit (
  ip           TEXT NOT NULL,
  saat         INTEGER NOT NULL,  -- floor(timestamp / 3600000)
  istek_sayisi INTEGER DEFAULT 0,
  PRIMARY KEY(ip, saat)
);

-- ── Mahalle baseline AI (statik seed, KNN için) ──────────────────
-- Extension'ın yerel mahalle-baseline.ts'inin sunucu kopyası
CREATE TABLE IF NOT EXISTS mahalle_baseline_ai (
  il_norm        TEXT NOT NULL,
  ilce_norm      TEXT NOT NULL,
  mahalle_norm   TEXT NOT NULL,
  kategori       TEXT NOT NULL,
  tlm2           REAL NOT NULL,
  guven          INTEGER,
  kaynak         TEXT,  -- 'ai-research' | 'knn-smoothing' | 'ilce-fallback'
  yakalandi      INTEGER,
  PRIMARY KEY(il_norm, ilce_norm, mahalle_norm, kategori)
);

-- ── Kullanıcılar (auth) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kullanicilar (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  email               TEXT NOT NULL UNIQUE,
  ad                  TEXT,
  pw_hash             TEXT NOT NULL,            -- PBKDF2-SHA256 hex
  pw_salt             TEXT NOT NULL,            -- random salt hex
  tier                TEXT NOT NULL DEFAULT 'free' CHECK(tier IN ('free','pro','pro_plus','kurumsal')),
  tier_bitis          INTEGER,                  -- abonelik bitiş ts (null=süresiz/free)
  olusturuldu         INTEGER NOT NULL,
  son_giris           INTEGER,
  admin               INTEGER NOT NULL DEFAULT 0,
  durum               TEXT NOT NULL DEFAULT 'aktif',    -- 'aktif' | 'banli' | 'dondurulmus'
  email_dogrulandi    INTEGER NOT NULL DEFAULT 0,
  dogrulama_kod       TEXT,
  dogrulama_son       INTEGER,
  sifre_sifirla_token TEXT,
  sifre_sifirla_son   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_kullanici_email ON kullanicilar(email);

-- ── Admin denetim logu (audit trail) ─────────────────────────────
CREATE TABLE IF NOT EXISTS admin_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id    INTEGER NOT NULL,
  olay        TEXT NOT NULL,
  hedef_id    INTEGER,
  payload     TEXT,
  ip          TEXT,
  ts          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_log_ts ON admin_log(ts DESC);
CREATE INDEX IF NOT EXISTS idx_admin_log_admin ON admin_log(admin_id, ts DESC);

-- ── Paylaşılabilir yatırımcı raporları ───────────────────────────
-- İstemci (extension/site) tam HTML'i önceden render eder, buraya POST eder;
-- GET /v1/rapor/:id public shareable link olarak text/html döner.
CREATE TABLE IF NOT EXISTS raporlar (
  id            TEXT PRIMARY KEY,          -- kısa public id
  html          TEXT NOT NULL,             -- önceden render edilmiş tam HTML
  baslik        TEXT,                      -- il/ilçe ada/parsel özeti
  olusturuldu   INTEGER NOT NULL,
  bitis         INTEGER,                   -- expiry ts (null=süresiz)
  goruntulenme  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_rapor_bitis ON raporlar(bitis);

-- ── Hata telemetrisi (observability) ─────────────────────────────
-- Extension (service-worker/content-script) ve backend runtime hataları.
CREATE TABLE IF NOT EXISTS hata_log (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  kaynak  TEXT NOT NULL,             -- 'service-worker' | 'sidepanel' | 'content:sahibinden' | 'backend'
  mesaj   TEXT NOT NULL,
  stack   TEXT,
  surum   TEXT,                      -- extension sürümü
  meta    TEXT,                      -- JSON ek bağlam
  ts      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hata_ts ON hata_log(ts DESC);
CREATE INDEX IF NOT EXISTS idx_hata_kaynak ON hata_log(kaynak, ts DESC);

-- ── AI Fiyat Cache ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_fiyat_cache (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  parsel_anahtar  TEXT NOT NULL,
  baseline_hash   TEXT NOT NULL,
  model           TEXT NOT NULL,
  alt_per_m2      REAL NOT NULL,
  beklenen_per_m2 REAL NOT NULL,
  ust_per_m2      REAL NOT NULL,
  gerekce         TEXT NOT NULL,
  sure_ms         INTEGER NOT NULL,
  olusturuldu     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_fiyat_cache_lookup ON ai_fiyat_cache(parsel_anahtar, baseline_hash, olusturuldu DESC);

-- ── AI Kullanım Kota ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_kullanim_kota (
  kullanici_id  INTEGER NOT NULL,
  gun           INTEGER NOT NULL,
  sayi          INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (kullanici_id, gun),
  FOREIGN KEY (kullanici_id) REFERENCES kullanicilar(id) ON DELETE CASCADE
);
-- ── Cadex Fiyat Endeksi ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fiyat_endeksi (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  il_norm     TEXT NOT NULL,
  kategori    TEXT NOT NULL DEFAULT 'arsa',
  yil         INTEGER NOT NULL,
  ay          INTEGER NOT NULL,
  medyan      INTEGER NOT NULL,
  adet        INTEGER NOT NULL DEFAULT 0,
  baz_endeks  REAL,
  hesaplandi  INTEGER DEFAULT (unixepoch()),
  UNIQUE(il_norm, kategori, yil, ay)
);
CREATE INDEX IF NOT EXISTS idx_endeks_il_kat ON fiyat_endeksi(il_norm, kategori, yil, ay);
CREATE INDEX IF NOT EXISTS idx_endeks_donem  ON fiyat_endeksi(yil, ay);

-- ── API v2 Batch Jobs ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_jobs (
  id            TEXT PRIMARY KEY,
  api_key_hash  TEXT NOT NULL,
  durum         TEXT NOT NULL DEFAULT 'bekliyor',
  istek_sayisi  INTEGER NOT NULL DEFAULT 0,
  tamamlanan    INTEGER NOT NULL DEFAULT 0,
  hata_sayisi   INTEGER NOT NULL DEFAULT 0,
  sonuc_json    TEXT,
  webhook_url   TEXT,
  olusturuldu   INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  tamamlandi_ts INTEGER
);
CREATE INDEX IF NOT EXISTS idx_api_jobs_key   ON api_jobs(api_key_hash);
CREATE INDEX IF NOT EXISTS idx_api_jobs_durum ON api_jobs(durum, olusturuldu);


