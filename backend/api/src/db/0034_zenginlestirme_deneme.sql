-- Migration 0034: Zenginleştirmede sessiz kalıcı yanığı durdur.
--
-- SORUN: `emlakjet-zenginlestirme.ts` detay sayfasını çekemediğinde ilanı
-- KALICI olarak `zenginlestirildi = <şimdi>` damgalıyordu ve bir daha asla
-- denemiyordu. `sayfaCek` hata türünü ayırmıyordu — 404 (ilan silinmiş),
-- 403/429 (kaynak bizi kısıtlıyor), 15 sn timeout ve ağ hatası hepsi aynı
-- `null` dönüyordu.
--
-- Sonuç: kaynak bir saat boyunca 429 verirse, o turdaki 120 ilanın TAMAMI
-- kalıcı olarak yanıyordu. Saatlik cron × 120 ilan = günde 2.880 ilan risk
-- altında ve hiçbir alarm yok.
--
-- Bu, üretimde imar kapsamının %1,9'da takılı kalmasının en olası açıklaması.
-- Kod bunu kendi kendine tespit EDEMİYORDU: `ZenginlestirmeSonuc` yalnızca
-- console.log'a gidiyor, `pipeline-health`'te imar/tapu doluluk kontrolü yok.
--
-- ÇÖZÜM: geçici hatalarda damga basılmaz, deneme sayacı artar. 3 denemeden
-- sonra vazgeçilir — kaynak kalıcı olarak engelliyorsa kuyruk sonsuza kadar
-- aynı kayıtları denemesin.

ALTER TABLE ilanlar ADD COLUMN zenginlestirme_deneme INTEGER;
ALTER TABLE ilanlar ADD COLUMN zenginlestirme_son_deneme INTEGER;

-- ── KURTARMA ────────────────────────────────────────────────────────────────
-- Damgalanmış AMA hiçbir alan kazanmamış kayıtlar kuyruğa döner.
--
-- Bu kayıtlar ya gerçekten boş detay sayfasına sahip (nadir) ya da yukarıdaki
-- hata yüzünden yanmış. Ayırt edemiyoruz; yeniden denemek ucuz, kaybetmek
-- pahalı. Yeni deneme sayacı sonsuz döngüyü engelliyor.
--
-- `koord_kaynagi = 'parsel'` olanlar hariç: onlar gerçek parsel koordinatı
-- kazanmış, yani zenginleştirme başarılı olmuş demektir.
UPDATE ilanlar
SET zenginlestirildi = NULL
WHERE kaynak = 'emlakjet'
  AND zenginlestirildi IS NOT NULL
  AND imar_durumu IS NULL
  AND tapu_durumu IS NULL
  AND baslik IS NULL
  AND (koord_kaynagi IS NULL OR koord_kaynagi <> 'parsel');

-- Kuyruk tablosu da yeniden kurulmalı (günlük cron yapacak), ama sayaçlar
-- şimdi tutarsız kalmasın diye sıfırlanıyor.
UPDATE zenginlestirme_kuyruk SET islenen = 0;

-- ── HAT GÖRÜNÜRLÜĞÜ ─────────────────────────────────────────────────────────
-- `ZenginlestirmeSonuc` (denenen/zenginlesen/imarBulunan/koordBulunan/
-- tapuBulunan/hata) şimdiye kadar YALNIZCA console.log'a gidiyordu. Cloudflare
-- log saklama süresi dolunca kayboluyor; yani hattın verimi hiçbir yerde
-- kayıtlı değildi ve "bu iş çalışıyor mu" sorusu cevaplanamıyordu.
CREATE TABLE IF NOT EXISTS zenginlestirme_log (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  calisti        INTEGER NOT NULL,
  denenen        INTEGER NOT NULL DEFAULT 0,
  zenginlesen    INTEGER NOT NULL DEFAULT 0,
  imar_bulunan   INTEGER NOT NULL DEFAULT 0,
  tapu_bulunan   INTEGER NOT NULL DEFAULT 0,
  koord_bulunan  INTEGER NOT NULL DEFAULT 0,
  baslik_bulunan INTEGER NOT NULL DEFAULT 0,
  kalici_hata    INTEGER NOT NULL DEFAULT 0,
  gecici_hata    INTEGER NOT NULL DEFAULT 0,
  sure_ms        INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_zenginlestirme_log_zaman
  ON zenginlestirme_log(calisti DESC);
