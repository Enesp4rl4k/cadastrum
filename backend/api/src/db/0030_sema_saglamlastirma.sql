-- Migration 0030: Şema sağlamlaştırma
--
-- Bu oturumda yapılan veri kaynağı çalışmaları sırasında ortaya çıkan üç
-- yapısal sorunu çözer. Üçü de "sessizce yanlış çalışan" türden: hata
-- vermiyorlar, sadece veri üretmiyorlar.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. mahalle_merkez — HİÇ VAR OLMAYAN TABLO
--
-- emlakjet-scraper.ts ve hepsiemlak-scraper.ts içindeki koordinatAra() bu
-- tabloya SELECT atıyor, try/catch ile sarılı olduğu için hata yutuluyor ve
-- fonksiyon HER ZAMAN null dönüyor. Sonuç: Worker hattından giren hiçbir ilan
-- koordinat almıyor, dolayısıyla spatial emsal motoru onları göremiyor.
-- Tablo hiçbir migration'da tanımlı değildi.
--
-- Veri kaynağı: src/lib/data/mahalle-merkezleri.ts (MERKEZ_TUPLES, 65.718
-- mahalle). Seed: scripts/mahalle-merkez-seed-uret.mjs
--
-- guven: üreteçten gelen confidence (0-1). <0.85 ilçe-fallback demek, yani
-- koordinat mahallenin değil ilçenin merkezi. Spatial motor bunu ayırt
-- edebilsin diye saklanıyor.
CREATE TABLE IF NOT EXISTS mahalle_merkez (
  il_norm      TEXT NOT NULL,
  ilce_norm    TEXT NOT NULL,
  mahalle_norm TEXT NOT NULL,
  lat          REAL NOT NULL,
  lng          REAL NOT NULL,
  guven        REAL NOT NULL DEFAULT 0.5,
  PRIMARY KEY (il_norm, ilce_norm, mahalle_norm)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Tarama rotasyonu tek tabloda birleşiyor
--
-- scraper_ilce_durum'un birincil anahtarında KAYNAK boyutu yoktu, bu yüzden
-- hepsiemlak için ayrı bir tablo (hepsiemlak_ilce_durum, 0029) açmak zorunda
-- kalmıştım. Üçüncü kaynakta üçüncü tablo açmak sürdürülebilir değil.
--
-- SQLite'ta birincil anahtar değiştirmek tablo yeniden kurmayı gerektiriyor.
-- Tablo küçük (1.946 + 973 satır) ve yalnızca cron hedef seçimi için
-- kullanılıyor — kayıp riski düşük, ilan verisine dokunulmuyor.
CREATE TABLE IF NOT EXISTS tarama_durum (
  kaynak      TEXT NOT NULL,           -- 'emlakjet' | 'hepsiemlak' | ...
  il_norm     TEXT NOT NULL,
  ilce_norm   TEXT NOT NULL,
  kategori    TEXT NOT NULL DEFAULT '_',  -- '_' = kategori ayrımı yok (hepsiemlak)
  son_tarama  INTEGER,
  son_eklenen INTEGER NOT NULL DEFAULT 0,
  son_durum   TEXT,
  PRIMARY KEY (kaynak, il_norm, ilce_norm, kategori)
);

-- Eski tablolardan taşı — son_tarama damgaları KORUNUR, yoksa taranmış
-- ilçeler yeniden en öne düşer ve rotasyon baştan başlar.
INSERT OR IGNORE INTO tarama_durum
  (kaynak, il_norm, ilce_norm, kategori, son_tarama, son_eklenen, son_durum)
SELECT 'emlakjet', il_norm, ilce_norm, kategori, son_tarama, son_insert_adet, son_durum
FROM scraper_ilce_durum;

INSERT OR IGNORE INTO tarama_durum
  (kaynak, il_norm, ilce_norm, kategori, son_tarama, son_eklenen, son_durum)
SELECT 'hepsiemlak', il_norm, ilce_norm, '_', son_tarama, son_eklenen, son_durum
FROM hepsiemlak_ilce_durum;

-- Rotasyon sorgusu: WHERE kaynak=? ORDER BY son_tarama ASC NULLS FIRST
CREATE INDEX IF NOT EXISTS idx_tarama_durum_rotasyon
  ON tarama_durum(kaynak, son_tarama ASC);

-- NOT: scraper_ilce_durum ve hepsiemlak_ilce_durum bu migration'da SİLİNMİYOR.
-- Kod yeni tabloya geçtikten ve bir tam cron turu doğrulandıktan sonra ayrı bir
-- migration ile düşürülecek. Geri dönüş yolu açık kalsın.

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Sıcak sorgu yollarına uyan indeksler
--
-- Mevcut indeksler tek tek kolonları kapsıyor ama gerçek WHERE cümleleriyle
-- örtüşmüyor; SQLite tablo başına tek indeks seçtiği için kısmi eşleşme
-- tarama demek.

-- routes/sorgu.ts spatial CMA:
--   WHERE kategori=? AND aktif=1 AND lat IS NOT NULL AND lng IS NOT NULL
--     AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ? AND yakalanma_tarihi >= ?
-- Mevcut idx_ilanlar_lat_lng kategori/aktif içermiyordu.
CREATE INDEX IF NOT EXISTS idx_ilanlar_kat_spatial
  ON ilanlar(kategori, aktif, lat, lng)
  WHERE lat IS NOT NULL AND lng IS NOT NULL;

-- routes/istatistik.ts agregasyonu:
--   GROUP BY il_norm, ilce_norm, mahalle_norm, kategori
-- Mevcut idx_ilanlar_lokasyon kategori'yi içermiyordu.
CREATE INDEX IF NOT EXISTS idx_ilanlar_lokasyon_kat
  ON ilanlar(il_norm, ilce_norm, mahalle_norm, kategori, aktif);

-- lib/emlakjet-zenginlestirme.ts kuyruğu:
--   WHERE kaynak='emlakjet' AND zenginlestirildi IS NULL AND aktif=1
-- Mevcut idx_ilanlar_zenginlestirme (zenginlestirildi, id) kaynak/aktif
-- içermiyordu, 34k satırda tarama yapıyordu.
CREATE INDEX IF NOT EXISTS idx_ilanlar_zeng_kuyruk
  ON ilanlar(kaynak, aktif, zenginlestirildi);
