-- 0042 — Okuma bütçesinin %30'unu yiyen iki sorgu için indeks.
--
-- ÖLÇÜM (wrangler d1 insights, 7 gün, 2026-09-13) — okuma payı:
--   %25  9.213.932 okuma / 369 sorgu = 24.970 satır/sorgu
--        SELECT id, ilan_no FROM ilanlar WHERE kaynak='emlakjet' AND aktif=1
--          AND zenginlestirildi IS NULL AND il_norm=? AND ilce_norm=? AND mahalle_norm=?
--          ORDER BY yakalanma_tarihi DESC LIMIT ?
--   %5   1.741.583 okuma / 61 sorgu = 28.551 satır/sorgu
--        SELECT … FROM zenginlestirme_kuyruk WHERE islenen < ? ORDER BY toplam DESC LIMIT 5
--
-- ── 1. Zenginleştirme bekleyen ilanlar ─────────────────────────────────────
-- EXPLAIN (öncesi): SEARCH ilanlar USING INDEX idx_ilanlar_kaynak_aktif (kaynak=? AND aktif=?)
-- Planlayıcı ORDER BY yakalanma_tarihi yüzünden (kaynak, aktif, tarih) indeksini
-- seçiyor ve emlakjet'in TÜM aktif ilanlarını (~25k) il/ilçe/mahalle için
-- satır satır süzüyordu. Mevcut 9 indeksin hiçbiri kaynak + konum + tarih
-- sırasını birlikte karşılamıyor.
--
-- KISMİ indeks: yalnızca zenginleştirme BEKLEYEN aktif satırlar giriyor.
-- Satır zenginleştirilince indeksten çıkıyor → indeks küçük kalıyor ve yazma
-- maliyeti düşük (yazma bütçesi okumadan daha dar: 7 günde günlük ort. 66k/100k).
CREATE INDEX IF NOT EXISTS idx_ilanlar_zeng_bekleyen
  ON ilanlar (kaynak, il_norm, ilce_norm, mahalle_norm, yakalanma_tarihi DESC)
  WHERE aktif = 1 AND zenginlestirildi IS NULL;

-- ── 2. Kuyruk önceliği ─────────────────────────────────────────────────────
-- EXPLAIN (öncesi): SEARCH … USING INDEX idx_zenginlestirme_kuyruk_oncelik (islenen<?)
--                   USE TEMP B-TREE FOR ORDER BY
-- (islenen, toplam DESC) indeksi `islenen < ?` aralığını buluyor ama o aralık
-- neredeyse tüm tablo; sonra hepsi geçici B-ağacında `toplam`a göre
-- sıralanıyordu. (toplam DESC) önde olunca SQLite en büyükten başlayıp
-- `islenen` şartını indeks içinde kontrol ediyor ve 5 eşleşmede DURUYOR.
DROP INDEX IF EXISTS idx_zenginlestirme_kuyruk_oncelik;
CREATE INDEX IF NOT EXISTS idx_zenginlestirme_kuyruk_toplam
  ON zenginlestirme_kuyruk (toplam DESC, islenen);

-- GERİ ALMA:
--   DROP INDEX idx_ilanlar_zeng_bekleyen;
--   DROP INDEX idx_zenginlestirme_kuyruk_toplam;
--   CREATE INDEX idx_zenginlestirme_kuyruk_oncelik ON zenginlestirme_kuyruk(islenen, toplam DESC);
