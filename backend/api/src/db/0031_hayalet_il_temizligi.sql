-- Migration 0031: Üretimdeki hayalet illerin temizliği.
--
-- SORUN (canlıdan ölçüldü): `/v1/fiyat/toplu-ozet?kategori=arsa` 83 il
-- döndürüyordu. Türkiye'de 81 il var. Fazladan iki il_norm:
--
--   "el zig"          Elâzığ — kaynak sayfa bozuk charset ile çözülmüş.
--                     normalizeYerAdi("El?zığ") → "el zig" (doğrulandı).
--   "emlak endeksi"   Parser bir sayfa etiketini il alanına yazmış.
--
-- Normalizasyon tanımadığı karakteri boşluğa çevirdiği için sonuç geçerli bir
-- yer adı gibi görünüyor; ingest'te il alanı bilinen listeye karşı hiç
-- doğrulanmadığından D1'e yeni bir il olarak yazılıyordu.
--
-- Kalıcı çözüm kodda: routes/ilan.ts artık `data/iller.ts` ile doğruluyor ve
-- bilinmeyen ili AYRI sayaçla reddediyor (bkz. test/sozlesme-il-dogrulama.spec.ts).
-- Bu migration yalnızca birikmiş kaydı temizler.
--
-- Çalıştır:
--   npx wrangler d1 execute cadastrum-db --remote --file="src/db/0031_hayalet_il_temizligi.sql"

-- Önce ne kadar etkilendiğini gör (çalıştırmadan önce elle bakılabilir):
--   SELECT il_norm, COUNT(*) FROM ilanlar
--   WHERE il_norm IN ('el zig','emlak endeksi') GROUP BY il_norm;

-- Kayıtlar SİLİNMİYOR, pasifleştiriliyor: fiyat verisi doğru olabilir ama
-- konumu güvenilmez olduğu için istatistiğe girmemeli. Silmek yerine pasif
-- bırakmak, sorunun izini de koruyor.
UPDATE ilanlar
SET aktif = 0
WHERE il_norm IN ('el zig', 'emlak endeksi');

-- Türetilmiş istatistik tablolarından tamamen çıkar — bunlar zaten yeniden
-- hesaplanabilir, hayalet ili taşımalarının bir faydası yok.
DELETE FROM il_istatistik      WHERE il_norm IN ('el zig', 'emlak endeksi');
DELETE FROM ilce_istatistik    WHERE il_norm IN ('el zig', 'emlak endeksi');
DELETE FROM mahalle_istatistik WHERE il_norm IN ('el zig', 'emlak endeksi');
DELETE FROM mahalle_zaman_serisi WHERE il_norm IN ('el zig', 'emlak endeksi');
