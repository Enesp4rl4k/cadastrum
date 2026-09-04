# Sentetik ilan yasağı

**2026-09-04'te silindi:** `scripts/seed-baseline-sql.mjs`, `scripts/seed-baseline-0{1..6}.sql`
(17 MB, 109.272 satır), `SEED-BASELINE.bat`, `SEED-FULL.bat`'ın ADIM 2 ve ADIM 3 blokları.

Bu belge, aynı fikrin altı ay sonra yeniden doğmaması için duruyor.

## Ne yapıyorlardı

`seed-baseline-sql.mjs`, `src/lib/data/mahalle-baseline.ts` + `mahalle-merkezleri.ts`
dosyalarını okuyup üretim D1'inin **`ilanlar`** tablosuna satır üretiyordu:

```sql
INSERT OR IGNORE INTO ilanlar (kaynak, ilan_no, ...) VALUES
('extension','bl_istanbul__basaksehir__bogazkoy_arsa','istanbul','basaksehir',
 'bogazkoy',8500,1000,'arsa','TL',...,'mahalle-merkez',1)
```

Amaç meşruydu: "spatial sorgu motoru tüm Türkiye'de anında çalışsın."
Uygulaması değildi.

## Neden tehlikeliydi

**1. Yanlış etiket.** `kaynak='extension'` — yani gerçek kullanıcı yakalamalarıyla
aynı etiket. Kardeş üreteç `mahalle-baseline-ai-seed-uret.mjs` tam olarak bu tuzağa
düşmemek için aynı veriyi `kaynak='statik-baseline'` ile **ayrı bir tabloya**
(`mahalle_baseline_ai`) yazıyor ve başlığında "tüketici ayırt edebilsin" diye not
düşüyor. Bu üreteç tersini yapıyordu.

**2. Filtresiz.** Tek ayırt edici işaret `ilan_no`'daki `bl_` önekiydi ve
`backend/api/src` ile `src/lib` genelinde onu filtreleyen **tek satır kod yoktu**.
Emsal havuzu sorguları, spatial motor, ilçe/mahalle medyanları, güven skoru ve
backtest'ler bu satırları gerçek gözlem sayardı.

**3. İçerik LLM üretimi.** Değerler `data/mahalle-ai-arastirma.json`'daki Gemini
kayıtlarından geliyor (not alanı: "İlçe ortalamasına göre"). `m2=1000` sabiti —
hiçbir gerçek ilanın taşımayacağı imza.

**4. Ölçüm katmanını çökertirdi.** Bu projede doğruluk `npm run backtest:real` ile
ölçülüyor ve o ölçüm gerçek ilan gözlemine dayanıyor. Baseline türevi satırları
gözlem havuzuna enjekte etmek, baseline'ı baseline'a karşı test etmek demektir —
MAPE iyimser tarafa sapar ve **bunu fark edecek hiçbir mekanizma yoktur**.

`SEED-FULL.bat` ADIM 3 ayrıca `il_istatistik` ve `ilce_istatistik` tablolarını
`mahalle_baseline_ai`'den dolduruyordu. `routes/fiyat.ts` bu tabloları
`kaynak:"ilan"` diye sunuyor — yani AI türevi değerler "gerçek ilan istatistiği"
etiketiyle kullanıcıya gidecekti.

## Doğrulandı: hiç çalıştırılmamışlar

Silmeden önce üretim kontrol edildi (2026-09-04):

- `SELECT COUNT(*) FROM ilanlar WHERE ilan_no GLOB 'bl_*'` → **0**
- Backtest korpusunun üç kaynağında da (`emlakjet-data-turkiye.sql`,
  `hepsiemlak-data.sql`, `ozellikli-ilanlar.sql`) `bl_` satırı → **0**
- ADIM 3'ün INSERT'i `il_istatistik.q1` kolonuna yazıyordu; o kolon şemada yok,
  yani çalıştırılsaydı hata verirdi.

Yani mevcut ölçümler temizdi. Risk gerçekleşmemiş, yalnızca bir çift tıklama
uzaktaydı.

## Kalıcı koruma

`backend/api/test/sentetik-ilan-reddi.spec.ts` — `ilanlar`'a yazan yollar
`bl_` önekli `ilan_no` kabul etmez. Mutasyonla doğrulanıyor: kontrolü kaldır,
test kırılır.

## Meşru ihtiyaç ne olacak?

"Spatial motor her yerde çalışsın" isteği hâlâ geçerli. Doğru cevabı:

- Tahmin verisi **`ilanlar`'a değil** `mahalle_baseline_ai`'ye yazılır (zaten öyle
  yapılıyor) ve `kaynak` alanı türetme olduğunu söyler.
- Motor gözlem bulamadığında **susmayı** veya aralık vermeyi seçer; gözlem
  kılığında tahmin üretmez.
- Kapsam sorunu tahminle değil **taramayla** çözülür: `npm run kapsam` boşluğu
  ölçer, `scripts/emlakjet-scrape-turkiye.mjs --hedef-listesi` oraya gider.
