-- Migration 0035: Ölü tabloları düşür.
--
-- İkisi de yazanı ve okuyanı olmayan tablolar. Boş durmaları zararsız görünür
-- ama şema okunurken "bu ne işe yarıyor" sorusunu doğuruyorlar ve
-- `pipeline-health` gibi denetim araçlarında yanlış güven veriyorlar.

-- 0030 ile `tarama_durum`'a taşındı. TS tarafında tek geçtiği yer
-- lib/veri-katmani.ts'teki bir yorum satırı.
DROP TABLE IF EXISTS scraper_ilce_durum;

-- DOĞDUĞU GÜN ÖLDÜ: 29 Ağustos'ta 0029 ile oluşturuldu, 30 Ağustos'ta 0030
-- `tarama_durum(kaynak, …)` ile gereksizleştirdi. Hiçbir kod okumadı/yazmadı.
DROP TABLE IF EXISTS hepsiemlak_ilce_durum;
