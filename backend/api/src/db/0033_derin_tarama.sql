-- Migration 0033: Sığ tarama, derin taramanın sırasını bozmasın.
--
-- SORUN: `tarama_durum` rotasyonu tek bir damgaya bakıyor (`son_tarama`) ve
-- taramanın NE KADAR DERİN olduğunu bilmiyor. İki farklı cron aynı kuyruğu
-- tüketiyor:
--
--   günlük  (index.ts "0 3 * * *")   maxSayfa = 25   ← derin
--   ayın 15 (index.ts "0 3 15 * *")  maxSayfa =  3   ← sığ
--
-- Sığ tur bir ilçeyi 3 sayfa tarayıp `son_tarama`yı ilerletiyor; ilçe kuyruğun
-- en sonuna gidiyor ve derin tarama ona aylarca uğramıyor. Yani sığ tarama
-- derin taramayı aç bırakıyor.
--
-- Bunun ölçülen sonucu, emlakjet kapsamının ~%39'da takılı kalması: kaynakta
-- bizdekinin ~2,5 katı ilan var ve sebebi piyasada ilan olmaması değil,
-- taramanın sığ kalması (bkz. index.ts'teki sayfa sayısı ölçümü).
--
-- ÇÖZÜM: derinlik ayrı damgalanır. Sığ tur `son_tarama`yı günceller ama
-- `son_derin_tarama`ya DOKUNMAZ; derin rotasyon o kolona bakar.
ALTER TABLE tarama_durum ADD COLUMN son_derin_tarama INTEGER;

-- Derin rotasyon: hiç derin taranmamış (NULL) olanlar önce.
CREATE INDEX IF NOT EXISTS idx_tarama_durum_derin
  ON tarama_durum(kaynak, kategori, son_derin_tarama);
