-- Migration 0016: hepsiemlak_run tablosu
-- Hepsiemlak GitHub Actions aylık cron takip tablosu.
-- Sahibinden scraper_run'ından ayrı tutulur — farklı tetik mekanizması.

CREATE TABLE IF NOT EXISTS hepsiemlak_run (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  baslangic     INTEGER NOT NULL,
  bitis         INTEGER,
  tetik         TEXT    NOT NULL DEFAULT 'github-actions-cron',
  run_ref       TEXT,                -- GitHub Actions run ID (string)
  islenen_ilce  INTEGER NOT NULL DEFAULT 0,
  toplam_insert INTEGER NOT NULL DEFAULT 0,
  durum         TEXT    NOT NULL DEFAULT 'calisiyor', -- calisiyor | tamam | hata | kismi
  son_hata      TEXT
);

-- Son çalışma zamanına göre hızlı sıralama
CREATE INDEX IF NOT EXISTS idx_hepsiemlak_run_baslangic ON hepsiemlak_run(baslangic DESC);

-- Açıklama: Durum değerleri
-- calisiyor : GitHub Actions hâlâ çalışıyor
-- tamam     : Tüm ilçeler başarıyla tarandı
-- hata      : Kritik hata, hiç insert yapılamadı
-- kismi     : Bazı ilçeler başarılı, bazıları hata verdi
