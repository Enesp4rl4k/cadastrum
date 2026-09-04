-- Migration 0032: Okuma bütçesi — tam tablo taramalarını önden hesaplanmış
-- küçük tablolarla değiştir.
--
-- SORUN (2026-09-04'te ölçüldü): Cloudflare D1 ücretsiz katmanı günde 5M satır
-- okuma veriyor ve bu limit DOLDU — `wrangler d1 execute` ve canlı uçlar
-- "exceeded D1's free tier daily row read limit" döndürmeye başladı.
--
-- Kullanıcı yok, yani yük tamamen cron + birkaç uçtan geliyordu. Üç kaynak:
--
--   1. emlakjet-zenginlestirme.ts:kuyrukGetir() — iki CTE (`islenen`, `toplam`)
--      `ilanlar` üzerinde ayrı ayrı GROUP BY tam tarama, sonra ana sorgu ikisiyle
--      JOIN. SAATLİK cron'dan çağrılıyor → günde ~24 × 3 tam tarama.
--   2. /v1/fiyat/toplu-ozet — `AVG(tlm2) FROM mahalle_baseline_ai GROUP BY il_norm`,
--      188.697 satırlık tam tarama, her cache-miss'te (s-maxage=7200).
--   3. (kodda çözüldü) mahalle ucunda AI fallback sorgusu her istekte koşuyordu.
--
-- ÇÖZÜM YÖNÜ: ağır agregasyon GÜNDE BİR kez yapılır, sonucu küçük bir tabloya
-- yazılır, sıcak yol o tabloyu okur. Yazma bütçesi (100k/gün) bol — darboğaz
-- okuma tarafında.
--
-- NEDEN İNDEKS DEĞİL: /toplu-ozet'in `WHERE kategori GROUP BY il_norm` deseni
-- mevcut `(il_norm, ilce_norm, kategori)` indeksinin lider kolonuyla uyuşmuyor.
-- Uyan bir indeks eklemek de 188k satırı yine OKUR, sadece daha hızlı okur —
-- satır okuma limiti indeksle ucuzlamaz. Sorguyu öldürmek gerekiyor.

-- ── 1. İl bazlı fiyat özeti — /toplu-ozet'in tam taraması yerine ────────────
-- 81 il × 2 kategori ≈ 162 satır. Günlük cron doldurur.
-- Ölçülen (ilan) ve türetilmiş (ai) değerler AYRI kolonlarda: uç noktası
-- hangisini sunduğunu söyleyebilsin diye. Tek bir "medyan" kolonu, kaynağı
-- gizleyip "AI tahmini gerçek ilan sanma" hatasını kolaylaştırırdı.
CREATE TABLE IF NOT EXISTS il_fiyat_ozet (
  kategori         TEXT    NOT NULL,
  il_norm          TEXT    NOT NULL,
  medyan_ilan      REAL,             -- gerçek ilan istatistiğinden (NULL = yok)
  adet_ilan        INTEGER NOT NULL DEFAULT 0,
  medyan_ai        REAL,             -- mahalle_baseline_ai ortalaması (NULL = yok)
  mahalle_ai_adet  INTEGER NOT NULL DEFAULT 0,
  guncellendi      INTEGER NOT NULL,
  PRIMARY KEY (kategori, il_norm)
);

-- ── 2. Zenginleştirme kuyruğu — saatlik tam taramanın yerine ────────────────
-- Mahalle başına "kaç ilan var / kaçı işlendi". Günlük cron yeniden kurar,
-- saatlik cron indeksli olarak okur ve işlediği kadar `islenen`'i artırır.
--
-- `islenen` saatlik turda artırıldığı için gün içinde gerçekle senkron kalır;
-- günlük rebuild birikmiş kaymayı sıfırlar.
CREATE TABLE IF NOT EXISTS zenginlestirme_kuyruk (
  il_norm      TEXT    NOT NULL,
  ilce_norm    TEXT    NOT NULL,
  mahalle_norm TEXT    NOT NULL,
  toplam       INTEGER NOT NULL DEFAULT 0,  -- o mahalledeki aktif emlakjet ilanı
  islenen      INTEGER NOT NULL DEFAULT 0,  -- zenginlestirildi damgası almış olan
  guncellendi  INTEGER NOT NULL,
  PRIMARY KEY (il_norm, ilce_norm, mahalle_norm)
);

-- Kuyruk seçimi: kotası dolmamışlar arasından en çok ilanı olan mahalle.
CREATE INDEX IF NOT EXISTS idx_zenginlestirme_kuyruk_oncelik
  ON zenginlestirme_kuyruk(islenen, toplam DESC);

-- ── 3. Okuma bütçesi izleme ────────────────────────────────────────────────
-- D1 her sorgu sonucunda `meta.rows_read` döndürüyor. Bugüne kadar bu sayı
-- hiçbir yerde toplanmıyordu — limitin dolduğu ancak sistem 500 vermeye
-- başlayınca fark edildi. Gün bazında toplanır, pipeline-health eşiğe bakar.
CREATE TABLE IF NOT EXISTS okuma_butcesi_gunluk (
  gun          TEXT    NOT NULL PRIMARY KEY,  -- "YYYY-MM-DD" (UTC, limit UTC'de sıfırlanır)
  satir_okuma  INTEGER NOT NULL DEFAULT 0,
  satir_yazma  INTEGER NOT NULL DEFAULT 0,
  guncellendi  INTEGER NOT NULL
);
