-- Migration 0039: başarısızlığı görünür kıl — iki ölçüm aracına hata sayacı
--
-- ── 1. okuma_butcesi_gunluk.hata_adet ───────────────────────────────────────
--
-- 2026-09-11'de D1 okuma limiti dolduğunda saatlik cron'lar ilk sorguda
-- reddedildi. Reddedilen sorgu `meta` döndürmeden FIRLATIYOR, sayaç ona hiç
-- dokunmuyordu; bütçe tablosu gün boyu tek satırda (1 sorgu, 18 okuma) kaldı.
-- Kesinti, "neredeyse hiçbir şey olmadı" gibi görünüyordu — ölçme aracı en
-- çok gerektiği anda körleşiyordu. Başarısız D1 çağrıları artık sayılıyor.
--
-- ── 2. zenginlestirme_log.gecici_dagilim ────────────────────────────────────
--
-- Her turda denemelerin ~%75'i "geçici hata" (403/429/5xx/timeout) ile
-- bitiyor ama HANGİSİ olduğu hiçbir yere yazılmıyordu. 403 (bot engeli),
-- 429 (hız limiti) ve timeout tamamen farklı çözümler ister; toplam sayı
-- teşhise yetmez. Dağılım JSON olarak tutuluyor: {"429": 60, "0": 12, ...}.
--
-- İki ALTER de ekleyici ve varsayılanlı — mevcut satırlar bozulmaz.

ALTER TABLE okuma_butcesi_gunluk ADD COLUMN hata_adet INTEGER NOT NULL DEFAULT 0;

ALTER TABLE zenginlestirme_log ADD COLUMN gecici_dagilim TEXT;
