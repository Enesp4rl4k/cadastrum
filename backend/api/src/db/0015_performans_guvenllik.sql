-- Migration 0015: Performans & Güvenlik İyileştirmeleri
-- Çalıştır: wrangler d1 execute cadastrum-db --file=src/db/0015_performans_guvenllik.sql
--
-- Değişiklikler:
--   1. kullanicilar.email üzerinde index (admin arama LIKE %q% için değil,
--      auth.ts'deki exact match sorgularını hızlandırmak için)
--   2. kullanicilar.durum üzerinde index (banli/dondurulmus filtresi)
--   3. ilanlar: lat/lng composite index (spatial sorgu bbox için)
--   4. ai_kullanim: (kullanici_id, gun) index (rate limit sorguları için)
--   5. giris_denemesi: dakika index (cleanup sorgusu için)
--   6. operasyon_kpi_v view — admin/operasyon-kpi endpoint'inin 5000 satır
--      JS-sort'unu DB'ye taşır; uygulama kodu sadece view'dan okur.

-- ── 1. Auth exact-match index ────────────────────────────────────────────────
-- auth.ts: SELECT * FROM kullanicilar WHERE email = ?
-- Bu sorgu zaten hızlı ama tablo büyüdükçe kritikleşir.
CREATE UNIQUE INDEX IF NOT EXISTS idx_kullanicilar_email
  ON kullanicilar(email);

-- ── 2. Durum filtresi index ──────────────────────────────────────────────────
-- Giriş kontrolünde durum='banli' filtresi için
CREATE INDEX IF NOT EXISTS idx_kullanicilar_durum
  ON kullanicilar(durum);

-- ── 3. Admin arama için compound index ──────────────────────────────────────
-- admin.ts: ORDER BY id DESC LIMIT ? OFFSET ? — id zaten PK ama
-- tier filtresi için compound index ekle
CREATE INDEX IF NOT EXISTS idx_kullanicilar_tier_id
  ON kullanicilar(tier, id DESC);

-- ── 4. Spatial bbox sorgusu için lat/lng index ───────────────────────────────
-- sorgu.ts: WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?
-- SQLite sadece tek kolon index kullanabilir; lat index en seçici olanı.
CREATE INDEX IF NOT EXISTS idx_ilanlar_lat_lng
  ON ilanlar(lat, lng)
  WHERE lat IS NOT NULL AND lng IS NOT NULL;

-- ── 5. AI kullanım rate limit sorgusu ───────────────────────────────────────
-- ai-fiyat.ts: WHERE kullanici_id = ? AND ts >= ? (günlük kota için gün bucket'ı)
-- NOT: ai_kullanim tablosunda 'gun' kolonu yok — ts (epoch ms) kullanılıyor.
-- ai-fiyat.ts içindeki ayrı ai_kullanim tablosunun farklı şeması var; index ts üzerine.
CREATE INDEX IF NOT EXISTS idx_ai_kullanim_uid_ts
  ON ai_kullanim(kullanici_id, ts);

-- ── 6. giris_denemesi cleanup index ─────────────────────────────────────────
-- cron cleanup: DELETE FROM giris_denemesi WHERE dakika < ?
CREATE INDEX IF NOT EXISTS idx_giris_denemesi_dakika
  ON giris_denemesi(dakika);

-- ── 7. rate_limit cleanup index ─────────────────────────────────────────────
-- cron cleanup: DELETE FROM rate_limit WHERE saat < ?
CREATE INDEX IF NOT EXISTS idx_rate_limit_saat
  ON rate_limit(saat);

-- ── 8. Operasyon KPI view ────────────────────────────────────────────────────
-- admin.ts /operasyon-kpi endpoint'i 5000 satırı JS'e çekip sort ediyordu.
-- Bu view, medyan sapma hesabını DB'de yapar — uygulama sadece view'dan okur.
--
-- Kullanım (admin.ts'de):
--   SELECT * FROM operasyon_kpi_v WHERE kategori = 'arsa' AND sinir_ts >= ?
--
-- NOT: SQLite'da pencere fonksiyonu (MEDIAN) yok. Yaklaşım:
--   ABS(fiyat_per_m2 - medyan) / medyan hesabını satır bazında yap,
--   uygulama tarafı sadece bu kolonu aggregate eder (çok daha az veri transfer).
DROP VIEW IF EXISTS operasyon_kpi_v;
CREATE VIEW operasyon_kpi_v AS
SELECT
  i.id,
  i.il_norm,
  i.ilce_norm,
  i.mahalle_norm,
  i.kategori,
  i.fiyat_per_m2,
  i.m2,
  i.yakalanma_tarihi,
  m.medyan                                              AS mahalle_medyan,
  -- Normalize sapma (0..∞, 0 = tam medyan üzerinde)
  CASE
    WHEN m.medyan > 0 AND i.fiyat_per_m2 > 0
    THEN ABS(i.fiyat_per_m2 - m.medyan) / m.medyan
    ELSE NULL
  END                                                   AS norm_sapma,
  -- Eksiklik flag'leri (1 = eksik)
  CASE WHEN i.mahalle_norm IS NULL THEN 1 ELSE 0 END   AS eksik_mahalle,
  CASE WHEN i.m2 IS NULL OR i.m2 <= 0 THEN 1 ELSE 0 END AS eksik_m2
FROM ilanlar i
LEFT JOIN mahalle_istatistik m
  ON  i.il_norm      = m.il_norm
  AND i.ilce_norm    = m.ilce_norm
  AND i.mahalle_norm = m.mahalle_norm
  AND i.kategori     = m.kategori
WHERE i.aktif = 1;

-- ── Uygulama notu ────────────────────────────────────────────────────────────
-- admin.ts /operasyon-kpi yeni sorgusu:
--
--   SELECT
--     COUNT(*)                                 AS toplam,
--     SUM(eksik_mahalle)                       AS eksik_mahalle,
--     SUM(eksik_m2)                            AS eksik_m2,
--     -- JS'de median(norm_sapma) hesapla — ama artık 5000 satır float, obje değil
--     GROUP_CONCAT(norm_sapma)                 AS sapmalar_csv  -- opsiyonel
--   FROM operasyon_kpi_v
--   WHERE kategori = 'arsa' AND yakalanma_tarihi >= ?
--
-- Bu yaklaşım: transfer edilen veri ~10x azalır (sadece sayılar, tüm obje değil).
