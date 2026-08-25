-- Migration 0020: Sadelestirme & Güvenlik Düzeltmeleri
-- Çalıştır: wrangler d1 execute cadastrum-db --file=src/db/0020_sadelestirme_guvenllik.sql
--
-- Bu migration, kod incelemesinde tespit edilen index eksikliklerini tamamlar.
-- Kod tarafındaki değişiklikler ayrı PR'larda uygulandı (bkz. SADELEŞTIRME-RAPORU.md).

-- ── 1. mahalle_baseline_ai: il_norm + ilce_norm sorgu hızlandırması ──────────
-- fiyat.ts ilçe fallback: WHERE il_norm = ? AND ilce_norm = ? AND kategori = ?
-- Mevcut PK (il_norm, ilce_norm, mahalle_norm, kategori) prefix eşleşiyor,
-- ama explicit covering index sorgu planını iyileştirir (EXPLAIN QUERY PLAN doğrulayabilir).
CREATE INDEX IF NOT EXISTS idx_baseline_ai_ilce
  ON mahalle_baseline_ai(il_norm, ilce_norm, kategori);

-- ── 2. ai_fiyat_cache: cache lookup index ──────────────────────────────────
-- ai-fiyat.ts: WHERE parsel_anahtar = ? AND baseline_hash = ? ORDER BY olusturuldu DESC
CREATE INDEX IF NOT EXISTS idx_ai_fiyat_cache_lookup
  ON ai_fiyat_cache(parsel_anahtar, baseline_hash, olusturuldu DESC);

-- ── 3. ai_kullanim_kota: günlük rate limit sorgusu ─────────────────────────
-- ai-fiyat.ts: WHERE kullanici_id = ? AND gun = ?
-- NOT: 0015'te ai_kullanim tablosu için index vardı ama ai_kullanim_kota için yoktu.
CREATE INDEX IF NOT EXISTS idx_ai_kullanim_kota_uid_gun
  ON ai_kullanim_kota(kullanici_id, gun);

-- ── 4. newsletter_aboneler: email unique index ─────────────────────────────
-- newsletter.ts duplicate kayıt önlemi için — tablo büyüdükçe INSERT OR IGNORE'u hızlandırır.
CREATE UNIQUE INDEX IF NOT EXISTS idx_newsletter_email
  ON newsletter_aboneler(email);

-- ── 5. admin_log: hedef_id + ts index ─────────────────────────────────────
-- admin.ts /kullanici/:id/detay: WHERE hedef_id = ? ORDER BY ts DESC
CREATE INDEX IF NOT EXISTS idx_admin_log_hedef_ts
  ON admin_log(hedef_id, ts DESC);

-- ── 6. kullanicilar: tier_bitis index ──────────────────────────────────────
-- admin.ts /yaklasan-bitis: WHERE tier_bitis IS NOT NULL AND tier_bitis <= ? AND tier_bitis > ?
CREATE INDEX IF NOT EXISTS idx_kullanicilar_tier_bitis
  ON kullanicilar(tier_bitis)
  WHERE tier_bitis IS NOT NULL;

-- ── 7. ilanlar: kaynak + aktif composite (scraper dedup sorgusu) ───────────
-- ilan.ts UPSERT: ON CONFLICT(kaynak, ilan_no) — UNIQUE constraint mevcut ama
-- aktif=1 filtresi içeren sayım sorguları bu index'ten yararlanır.
CREATE INDEX IF NOT EXISTS idx_ilanlar_kaynak_aktif
  ON ilanlar(kaynak, aktif, yakalanma_tarihi DESC);
