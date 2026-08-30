# Veri hattı kontrol listesi — sessiz hata yasağı

> Roadmap Sprint B.2. Yeni bir veri hattı (scraper, zenginleştirme cron'u,
> harici API entegrasyonu, seed script'i) üretime çıkmadan önce bu liste
> doldurulur. PR açıklamasına kopyalanır.

Bu listenin sebebi tek bir gözlem: bu projede bulunan hataların hepsi aynı
sınıftandı — **sistem hata vermiyor, makul görünen çıktı üretiyor, ama veri
yanlış ya da yok.** CI üç projede yeşildi ve hiçbirini yakalayamadı, çünkü her
katman kendi başına doğruydu. Aşağıdaki her madde, gerçekten yaşanmış bir
kaybın karşılığıdır.

---

## 1. Yokluk kararı

Boş dönebilen her sorgu/çağrı için, boşluğun **geçerli mi alarm mı** olduğuna
önceden karar verilir.

- [ ] Bu hattın döndürebileceği "boş" sonuçlar listelendi.
- [ ] Her biri için karar yazıldı: *geçerli yokluk* mu, *alarm* mı?
- [ ] Alarm olanlar `pipeline-health`'e bir kontrol olarak eklendi
      (`backend/api/src/routes/pipeline-health.ts`).
- [ ] Geçerli yokluk olanlar kodda `// beklenen yokluk: <sebep>` ile işaretli.

> `poi_noktalari` boştu ve `/v1/harita/poi` boş dizi döndürüyordu. Hata değil,
> ölü özellik. `mahalle_baseline_ai` boştu ve `fiyat.ts`'teki dört fallback
> yolu ölüydü. İkisi de aylarca "çalışıyor" göründü.

## 2. Bitiş koşulu

- [ ] Sayfalama/kuyruk döngüsünün bitiş koşulu **kaynağın verdiği sinyale**
      dayanıyor (boş sayfa, HTTP durumu, `hasMore` alanı).
- [ ] Bitiş koşulu **bizim dedupe setimize** dayanmıyor.
- [ ] "Bu sayfada yeni öğe yok" ile "kaynak bitti" kodda ayrı iki koşul.
- [ ] Sayfalama parametresi gerçekten etki ediyor mu, elle doğrulandı
      (iki farklı sayfa, farklı içerik).

> Aynı hatayı iki kez yaptık: emlakjet'te "yeni ilan yok → break" sığ taranmış
> ilçelerde envanterin %61'ini aldırmadı. Milli Emlak'ta `pageIndex` yok
> sayıldığı için aynı sayfa 8 kez çekildi (%88 kopya).
> Regresyon testi: `backend/api/test/sessiz-hata-sozlesme.spec.ts`.

## 3. HTTP durumu

- [ ] Fetch sarmalayıcısı **durum kodunu çağırana döndürüyor** (`null` değil).
- [ ] 429/403/503 ayrı ele alınıyor: geri çekilme + üst üste görülürse durma.
- [ ] Engellenme, ilerleme kaydına "tarandı" diye yazılmıyor;
      rotasyon damgası `bot-engel` ve `son_tarama` **ilerletilmiyor**
      (`lib/veri-katmani.ts::taramaDamgala`).
- [ ] 404 ile 429 farklı davranışa yol açıyor.

> hepsiemlak'ta 429 yutuldu; engellendiğimiz 254 ilçe "tarandı, ilan yok" diye
> damgalandı ve rotasyonun en sonuna düştü — bir daha hiç taranmayacaklardı.

## 4. `catch` disiplini

- [ ] Hattaki her `catch` üçünden biri: görünür fallback / `hataKaydet()` /
      gerekçeli `// beklenen yokluk:` işareti.
- [ ] `npm run lint:catch` yeşil.
- [ ] Yutulan istisna, çağırana "veri yok" gibi görünmüyor.

> `koordinatAra()` var olmayan bir tabloya sorup sessizce `null` dönüyordu;
> koordinat kapsamı %37'de takılıydı ve tablonun hiç var olmadığı aylarca fark
> edilmedi.

## 5. Sözleşme

- [ ] Yeni alanlar uçtan uca izleniyor: payload → şema → INSERT → SELECT
      (`backend/api/test/sozlesme-alan-yolculugu.spec.ts` genişletildi).
- [ ] Yeni tablo/kolon migration'ı **tek tek ve hata yutmadan** uygulanıyor
      (`sozlesme-migration.spec.ts`).
- [ ] Yeni korumalı endpoint mount sırasına takılmıyor
      (`sozlesme-route-erisim.spec.ts`).
- [ ] Yeni kaynak yalnızca parser yazarak eklendi; yazma/koordinat/rotasyon
      `lib/veri-katmani.ts` üzerinden.

> `baslik` dört katmanın üçünde eksikti; extension yakalıyor, aktarımda
> düşüyordu — 530 ilanda başlık yok. `wrapD1` sarmalayıcısı `batch()`'i
> açmıyordu, `/v1/istatistik/refresh` aylarca tamamen bozuktu.

## 6. Parser testi

- [ ] Parser'ın **gerçek sayfa fixture'ına** karşı testi var.
- [ ] Bozuk/eksik alanlı kayıtta parser sessizce 0 sonuç dönmüyor, eleme
      davranışı test edilmiş.
- [ ] Kabul ölçütü uygulandı: **düzeltmeyi geri al, test kırılsın.**

> `emlakjet-scraper.ts` üretimdeki 34 bin ilanın tamamını üretiyordu ve hiç
> testi yoktu. Şimdi var: `backend/api/test/emlakjet-scraper.spec.ts`.

## 7. "Çalışmıyor" sinyali

- [ ] Bu hat çalışmayı bıraktığında **hangi ölçüm değişir**, yazıldı.
- [ ] O ölçüm `pipeline-health` içinde bir eşiğe bağlandı.
- [ ] Hat kendi durumunu **kendisi yazmıyor** — ya da yazıyorsa, dışarıdan
      doğrulayan ikinci bir kontrol var.

> `scraper_ilce_durum` yalnızca scraper'ın kendisi tarafından yazılıyordu;
> rotasyon 3 ilçeye kilitlendi ve aylarca kimse fark etmedi. Kendi kendini
> besleyen durum, tek koşuda anormallik göstermez.

---

## Doğrulama komutları

```bash
npm run lint && npm run lint:catch && npm test
```

```bash
cd backend/api && npx tsc --noEmit && npm test
```

Üretim değişmezleri (canlı):

```bash
curl -H "Authorization: Bearer $STATS_SECRET" https://cadastrum-api.cadastrum-tr.workers.dev/v1/admin/pipeline-health
```
