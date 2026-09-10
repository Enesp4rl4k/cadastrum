-- Migration 0038: okuma bütçesine KAYNAK kırılımı — ve alarmın onarımı
--
-- ── NEDEN: KURULAN ALARM HİÇ ÇALIŞMADI ──────────────────────────────────────
--
-- 0032 `okuma_butcesi_gunluk` tablosunu 2026-09-04 kesintisinden sonra kurdu:
-- D1 ücretsiz katmanın 5M satır/gün okuma limiti dolmuş, sistem 500 vermeye
-- başlamış, hiçbir kontrol uyarmamıştı.
--
-- Ama o tabloya YAZAN KOD HİÇ YAZILMADI. `pipeline-health` onu okuyor, satır
-- bulamıyor, `okunanSatir = 0` yapıyor ve `0 <= 3.500.000` ile HER KOŞUMDA
-- YEŞİL dönüyordu. 2026-09-09'da limit yine doldu, pano yine yeşildi.
--
-- Yani alarmın kendisi, kurulmasına sebep olan hata sınıfının örneğiydi:
-- var görünen ama ölçmeyen kontrol.
--
-- ── NEDEN KAYNAK KIRILIMI ───────────────────────────────────────────────────
--
-- "Bugün 4,7M satır okundu" bilgisi tek başına eyleme dönüşmüyor. Asıl soru
-- **kimin yediği**. Ölçüldü (2026-09-09): üretimde toplam 4 kullanıcı sorgusu
-- var (`fiyat_katman_gunluk`), yani yükün tamamı cron'lardan geliyor — ama
-- hangisinden bilinmiyor. Kaynak kırılımı olmadan tek yapılabilecek şey
-- "limiti büyütmek", ki bu israfı pahalılaştırmaktan başka bir şey değil.
--
-- ── TABLO NEDEN YENİDEN KURULUYOR ───────────────────────────────────────────
--
-- 0032'deki birincil anahtar `(gun)`; kaynak kırılımı için `(gun, kaynak)`
-- gerekiyor ve SQLite birincil anahtarı ALTER ile değiştiremiyor.
--
-- Veri kaybı riski YOK: tabloya hiç yazılmadı, yani boş. Bu, "önce satır sayısı
-- kontrol edilir" kuralının istisnası değil — sayıldı ve 0 çıktı (tabloya yazan
-- kod olmadığı için başka türlüsü mümkün de değildi).

DROP TABLE IF EXISTS okuma_butcesi_gunluk;

CREATE TABLE okuma_butcesi_gunluk (
  -- "YYYY-MM-DD", UTC — D1'in günlük limiti UTC gece yarısında sıfırlanıyor,
  -- yerel gün kullanmak sayacı limitle hizasız yapardı.
  gun          TEXT    NOT NULL,
  -- Cron adı ya da route yolu: 'cron-daily', 'cron-hourly', 'emsal-spatial' …
  kaynak       TEXT    NOT NULL,
  satir_okuma  INTEGER NOT NULL DEFAULT 0,
  satir_yazma  INTEGER NOT NULL DEFAULT 0,
  -- Kaç D1 çağrısı sayıldı — ortalama sorgu maliyetini görmek için.
  sorgu_adet   INTEGER NOT NULL DEFAULT 0,
  -- KAPSAM DÜRÜSTLÜĞÜ: `first()` çağrıları D1'de `meta` DÖNDÜRMÜYOR, yani
  -- okuma maliyetleri sayılamıyor. Kaç çağrının böyle olduğu burada tutuluyor
  -- ki toplam "eksik olabilir" diye okunabilsin. Sayılamayan maliyeti sıfır
  -- saymak, tam da bu tablonun önlemek için kurulduğu hata.
  metasiz_adet INTEGER NOT NULL DEFAULT 0,
  guncellendi  INTEGER NOT NULL,
  PRIMARY KEY (gun, kaynak)
);

-- Günlük toplamı çekmek için (pipeline-health son 1 günü okuyor).
CREATE INDEX IF NOT EXISTS idx_okuma_butcesi_gun ON okuma_butcesi_gunluk(gun);
