# Sprint C & D — Site ve Uzantı Bozuk Hatları

> Bu doküman 30 Ağustos 2026'da yapılan **canlı denetimin** çıktısıdır.
> Sprint A (katman sınırı sözleşme testleri) ve Sprint B (sessiz hata yasağı)
> tamamlandıktan sonra, aynı sınıf hataların site ve uzantı tarafında da olup
> olmadığı sorusuyla başlandı. Cevap: var, ve bir kısmı kullanıcının gözünün
> önünde.
>
> **Bulguların büyük kısmı canlı ortamda doğrulandı** (curl + tarayıcı). Hangi
> bulgunun nasıl doğrulandığı her maddede yazılı. Statik okumayla bulunup canlı
> doğrulanmayanlar ayrıca işaretli.

---

## Özet tablo

> **DURUM (30 Ağustos 2026, deploy sonrası):** P0–P2'nin tamamı düzeltildi,
> deploy edildi ve canlıda doğrulandı. Commit'ler: `630e8d7` (P0), `373007b` (P1),
> `484830b` (P2), `6cf6eca` (deploy dalı). Kalan tek başlık 13/14'ün bir kısmı —
> aşağıda "Sırada ne var" bölümüne taşındı.

| # | Bulgu | Yüzey | Durum |
|---|---|---|---|
| 1 | Harita altlığı "API KEY REQUIRED" filigranlı | Site + Uzantı | ✅ Esri, canlıda doğrulandı |
| 2 | `/veri/{il}/{ilce}` derin bağlantıları ANASAYFA döndürüyor | Site | ✅ 1.174 sayfa, canlıda doğrulandı |
| 3 | Harita il popup'ı her tıklamada bozuk (404) | Site | ✅ `/fiyat/toplu-ilce-ozet` |
| 4 | `YIL_MAX = 1970` — Workers global saat tuzağı | Backend | ✅ istek içine taşındı + test |
| 5 | `koord_kaynagi` batch/katkı yolunda her zaman NULL | Uzantı→Backend | ✅ şemaya eklendi + 3 yol testi |
| 6 | Crowdsource ilanlar koordinatsız | Uzantı | ✅ `lib/ilan-payload.ts` ortak kurucu |
| 7 | Uzantının 4 endpoint çağrısı boşa gidiyor | Uzantı | ✅ dördü de düzeltildi |
| 8 | Fiyat endpoint'leri veri yokken 200 + boş | Backend→Site | ✅ 404, canlıda doğrulandı |
| 9 | Trend ve "gelişen bölgeler" sahte-nötr | Site+Backend | ✅ "veri yetersiz" açıkça |
| 10 | Otoyol katmanı: dosya deposunda yok | Site | ✅ 12.087 nokta, canlıda |
| 11 | Endeks: okunamayan eksen + zayıf taban | Site+Backend | ✅ `baz_zayif`, canlıda |
| 12 | Sabit sayılar "canlı veri" rozetiyle | Site | ✅ build-time canlı veri |
| 13 | `content/` + `background/` sıfır test | Uzantı | ◐ `background/` payload kurucu testli; `content/` parser'ları hâlâ testsiz |
| 14 | `site/` sıfır davranış testi | Site | ◐ 22 test (rota + varlık sözleşmesi); sayfa render/boş durum testi yok |
| 15 | Deploy `--branch production` sessizce PREVIEW'a gidiyordu | Deploy | ✅ `master` + doğrulama notu |

---

## P0 — Kullanıcının gözünün önünde bozuk

### 1. Harita altlığı filigranlı: "API KEY REQUIRED"

CARTO, anahtarsız isteklere artık **HTTP 200** ile filigranlı döşeme dönüyor.
Hata fırlatmadığı için hiçbir yerde alarm yok — ders kitabı sessiz bozulma.

```
GET https://a.basemaps.cartocdn.com/dark_nolabels/5/18/12@2x.png
→ 200 image/png, üzerinde "API KEY REQUIRED / carto.com/basemaps/apikey"
```

Etkilenen: `site/src/scripts/harita-init.ts:1786` (`dark_nolabels`),
`src/lib/basemaps.ts:51,75` (`light_all`, `dark_all` — uzantının hem açık hem
koyu teması). Yani **site haritası da uzantı haritası da** filigranlı.

Doğrulama: `/harita` sayfası tarayıcıda açıldı, tüm Türkiye filigran altında.
Döşeme ayrıca doğrudan indirilip görüntülendi.

**Seçenekler**
| Yol | Artı | Eksi |
|---|---|---|
| Esri gri altlık (`services.arcgisonline.com/.../World_Dark_Gray_Base`) | Anahtarsız çalışıyor (test edildi, filigransız), uzantı zaten `esri-sat` için aynı servisi kullanıyor | Etiketler gömülü (`nolabels` karşılığı ayrı katman), Esri atıf zorunlu |
| CARTO ücretsiz API anahtarı | Görsel dil aynı kalır | Anahtar sırrı istemciye gömülür, kota riski |
| Protomaps `.pmtiles` → kendi R2'miz | Üçüncü tarafa bağımlılık biter, `TUCBS_TILES` R2 binding'i zaten var | ~100 MB Türkiye ekstresi + kurulum işi |

**Öneri:** hemen Esri'ye geç (tek satır), orta vadede Protomaps+R2'yi değerlendir.
Ek olarak: altlık döşemesi için **görünür sağlık kontrolü** — döşeme
`content-length` veya deneme isteği ile "filigran/hata" tespiti, aksi hâlde
aynı sınıf hata bir dahaki sağlayıcıda tekrar sessizce gelir.

### 2. `/veri/{il}/{ilce}` derin bağlantıları anasayfayı döndürüyor

`site/public/_redirects:5`'teki kural Cloudflare Pages'te **çalışmıyor**:

```
/veri/* /veri/detay/index.html 200!      ← Netlify sözdizimi (`!` force)
```

Canlı sonuç:

| URL | Dönen sayfa |
|---|---|
| `/veri/istanbul` | ✅ doğru (statik dosya var, kural devreye girmiyor) |
| `/veri/istanbul/catalca` | ❌ **anasayfa** (200) |
| `/veri/istanbul/besiktas/bebek` | ❌ **anasayfa** (200) |
| `/veri/uydurma-il` | ❌ **anasayfa** (200) — 404 olmalıydı |
| `/veri/detay?il=...&ilce=...` | ✅ doğru |

Etki iki katlı:
1. `site/src/pages/veri/[il].astro:391` her ilçeyi `/veri/{il}/{ilce}` diye
   bağlıyor → **il sayfasındaki her ilçe bağlantısı anasayfaya düşüyor.**
2. `sitemap.xml`'de **181 URL'in 90'ı** (`%50`) bu derin biçimde. Google'a
   90 adet "içerik" bildirilip hepsinde anasayfa sunuluyor.

> Not: Önceki incelemede "`_redirects` il sayfalarını da bozuyor" denmişti —
> **yanlış**, `/veri/istanbul` çalışıyor. Bozuk olan yalnızca 2+ segmentli yollar.

**Çözüm yönü:** Cloudflare Pages'te SPA fallback `_routes.json` + gerçek dosya
üretimiyle çözülür. En temizi `[il]/[ilce].astro` (ve gerekiyorsa
`[il]/[ilce]/[mahalle].astro`) sayfalarını `getStaticPaths` ile üretmek —
sitemap zaten bu URL'leri vaat ediyor. Alternatif: bağlantıları ve sitemap'i
`/veri/detay?...` biçimine çekmek (SEO açısından daha zayıf).

### 3. Harita il popup'ı: olmayan endpoint

`site/src/scripts/harita-init.ts:247`

```ts
fetch(`${API_BASE}/fiyat/ilce/${ilNorm}?kategori=${fiyatKategori}`)
```

Canlı: `GET /v1/fiyat/ilce/istanbul` → **404**. Backend'de bu yol
`/fiyat/ilce/:il/:ilce` (iki segment). Doğru endpoint
`/fiyat/toplu-ilce-ozet/:il` — canlı test edildi, 200 ve doğru veri dönüyor.

Üstelik URL düzeltilse bile alan adları tutmuyor: script `data.mahalleler[].ilce_norm`
okuyor, doğru endpoint `data.ilceler[].ilce_norm` döndürüyor. İki düzeltme
birlikte yapılmalı.

Kullanıcı etkisi: haritada bir ile her tıklayışta "İlçe verisi alınamadı".

### 4. `YIL_MAX = 1970` — Cloudflare Workers global saat tuzağı

Cloudflare Workers'ta **modül seviyesinde** `Date.now()` sıfır döner (saat ilk
isteğe kadar ilerlemez). Dolayısıyla:

```ts
backend/api/src/routes/harita.ts:41   const YIL_MAX = new Date().getFullYear();  // → 1970
backend/api/src/routes/proxy.ts:359   const ANALIZ_YIL_MAX = new Date().getFullYear();  // → 1970
```

Canlı kanıt — hata mesajının kendisi ele veriyor:

```
GET /v1/harita/analiz?ilceKodu=118&analizTip=1&yil=2024
→ {"error":"yil 2003–1970 arasında olmalı"}

GET /v1/proxy/tkgm-analiz?analizTip=1&yil=2024&ilceKodu=118
→ {"error":"yil 2003–1970 arasında olmalı"}
```

Sonuçlar:
- `/v1/proxy/tkgm-analiz` **her istekte 400** — endpoint tamamen ölü.
- `/v1/harita/analiz` yıl verilirse 400, verilmezse `hedefYil = YIL_MAX - 1 = 1969`
  → her zaman boş.
- `/v1/harita/ozet` varsayılanı da 1969 → boş. (`?yil=2024` ile veri geliyor:
  9.7 KB — yani **veri D1'de duruyor, sadece erişilemiyor.**)

Bu tek satırlık bir hata değil, bir **sınıf**: Workers'ta modül seviyesinde saat
okumak. Düzeltme + aynı kalıbı yasaklayan bir kontrol gerekiyor (Sprint B'nin
catch tarayıcısına benzer küçük bir kural ya da bir test).

---

## P1 — Sessiz veri kaybı

### 5. `koord_kaynagi` batch ve katkı yolunda her zaman NULL

`baslik` hatasının birebir aynısı, düzeltilmemiş ikinci kopyası:

- Uzantı gönderiyor: `src/background/scraping-runtime.ts:220`, `service-worker.ts:70`
- `IlanIngestSchema` (`backend/api/src/lib/validation.ts:20-47`) bu alanı
  **tanımıyor** → zod strip ediyor.
- `POST /v1/ilan` ham gövdeden okuduğu için çalışıyor (`ilan.ts:96`).
- `POST /v1/ilan/batch` (`ilan.ts:184`) ve `POST /v1/ilan/katki` (`ilan.ts:253`)
  **parse edilmiş** nesneden okuyor → `undefined` → kolon NULL.
- `type ValidIlan = z.infer<...> & { koord_kaynagi?: string }` (`ilan.ts:55`)
  TS'yi susturuyor; derleyici uyarmıyor.

**Sprint A'nın alan yolculuğu testi bunu neden yakalamadı:** test
`/v1/ilan/katki` yolunu kullanıyor ve `d1denOku()` sorgusunda `koord_kaynagi`
kolonunu **SELECT ediyor** ama üzerine **hiç assert yazılmamış**
(`sozlesme-alan-yolculugu.spec.ts:62,84-95`). Sözleşme testinin kendisinde bir
boşluk — düzeltme sırasında testin de kapatılması gerekiyor.

Etki: `koord_kaynagi`, spatial emsal motorunun "gerçek parsel koordinatı" ile
"mahalle merkezi" ayrımını yapmasını sağlayan alan. NULL olduğunda ayrım kayboluyor.

### 6. Crowdsource ilanlar koordinatsız gidiyor

- `src/content/sahibinden-liste.ts` ve `hepsiemlak-liste.ts` `lat`/`lng` **hiç
  üretmiyor** (diğer alanlar açıkça `null`'lanmış, bu alanlar hiç yok).
- `src/background/scraping-runtime.ts:217-219` mahalle-merkez fallback'i
  **uygulamıyor** — oysa `service-worker.ts:37-46` aynı durumda uyguluyor.
  İki yol arasında sessiz asimetri.

Sonuç: liste taramasından gelen ilanlar `lat=NULL` yükleniyor ve
`GET /v1/emsal/spatial` sonuçlarına hiç giremiyor. Uzantı kendi topladığı veriyi
göremiyor.

*(Statik okumayla bulundu; canlı D1 sorgusu için admin sırrı gerekiyor —
`/v1/admin/pipeline-health` ile doğrulanmalı.)*

### 7. Uzantının üç endpoint çağrısı boşa gidiyor

| Çağrı | Yer | Canlı sonuç |
|---|---|---|
| `GET /v1/istatistik/refresh?secret=...` | `src/sidepanel/views/BootstrapView.tsx:114` | **404** — backend `POST` + `Bearer` + `STATS_SECRET` bekliyor (`index.ts:468`). Metot, taşıyıcı ve sırrın üçü de yanlış. |
| `POST /v1/gercek-satis` | `src/lib/gercek-fiyat.ts:156` | **404** — backend'de böyle bir yol yok |
| `GET /v1/proxy/tucbs/tile?wms=..&bbox=..` | `src/lib/tucbs-wms-tiles.ts:35` | **404** — backend `/tucbs/tile/:wms/:z/:x/:y` (path param) |
| `POST /v1/bildirim/kontrol` | `src/background/scheduler.ts:246` | **401 "Token yok"** — JWT ara katmanı önce cevaplıyor; route `bildirim.ts`'te tanımlı değil, mantık `bildirim-cron.ts`'te cron'a bağlı. Sprint A.2'nin "mount gölgelemesi" imzası. |

Hepsi `!res.ok → sessiz return` ile yutuluyor; hiçbiri loglanmıyor.

Ek: `gercekFiyatlar` Dexie tablosu **write-only** — yazılıyor, okuyan
fonksiyonların çağıranı yok; ayrıca `.where("backendSenkronlandi").equals(0)`
sorgusu boolean yazılan alanda **hiçbir zaman eşleşmiyor** (IndexedDB boolean
indekslemez). "Gerçek satış fiyatı kalibrasyonu" özelliği uçtan uca yarım.

### 8. Fiyat endpoint'leri veri yokken 200 + boş dönüyor

```
GET /v1/fiyat/ilce/istanbul/hicolmayanilce  → 200 {"mahalleler":[]}
GET /v1/fiyat/il/hicolmayanil               → 200 {"ilceler":[]}
```

`fiyat.ts:137,194` — `ilceIstatistik` `undefined` olduğunda spread hiçbir şey
eklemiyor, status yine 200. Site yalnızca `res.ok`'a baktığı için
(`veri/detay.astro:208`) boş durum kartı **hiç tetiklenmiyor**; kullanıcı
"— TL/m²", "— güncellendi", "Kaynak —" dolu bir kart görüyor.

Tutarsızlık: aynı dosyada mahalle yolu düzgün **404** dönüyor. Yani doğru
davranış zaten kodda var, iki yola uygulanmamış.

### 9. Trend ve gelişen bölgeler katmanları sahte-nötr

Canlı ölçüm:

```
/v1/harita/trend?kategori=arsa      → 67 il, veri_var=true olan: 0, hepsi "Stabil"
/v1/harita/gelisen-bolgeler         → 81 il, fiyat_momentum ≠ 20 olan: 0
                                       (20 = "veri yok" nötr fallback)
                                       yine de 5 il "🔥 Yüksek Potansiyel"
```

Kök neden: `mahalle_zaman_serisi` yalnızca **3 ay** veri tutuyor (2026-06/07/08 —
`/fiyat/trend/...` ile doğrulandı). Her iki endpoint de "önceki 6 ay" / "önceki
3 ay" penceresine bakıyor, o pencere boş.

Ama asıl kusur veri eksikliği değil, **sunumu**: `harita-init.ts:537-545` veri
olmayan iller için de daire çiziyor ve gri "stabil" gösteriyor; gelişen bölgeler
haritası statik likidite+altyapı tablosundan üretilmiş skoru canlı analiz gibi
sunuyor. Sprint B'nin B.2 maddesinin ("yokluk kararı") tam olarak yasakladığı şey.

---

## P2 — Dürüstlük ve yapısal boşluklar

### 10. Otoyol katmanı — dosya yok
`harita-init.ts:869` `/geo/otoyollar.geojson` çekiyor; `site/public/geo/` içinde
yalnızca `poi-katmanlari.json` var. Canlı: istek **HTML** (anasayfa) dönüyor,
`res.json()` patlıyor, hata mesajı `finally { durumGuncelle(""); }` ile anında
siliniyor (`harita-init.ts:874-880`). Kullanıcı düğmeye basar, hiçbir şey olmaz.

### 11. Endeks baz dönemi gürültü üzerine kurulu
Canlı: 2026-06 → **882 ilan**, 2026-07 → 11.558, 2026-08 → 11.474. İlk ay veri
toplamanın kısmi ilk ayı ve **baz (100) olarak alınmış**. Sitede "+11,7% son 3 ay"
diye sunuluyor. Ayrıca grafik Y ekseninde 5 etiketin 4'ü "7K ₺" (yuvarlama).

### 12. Sabit sayılar "canlı veri" rozetiyle
`site/src/pages/veri/index.astro:7-16` — İstanbul "20.5K TL/m²" sabit yazılı;
aynı sayfada `:73` "Canlı veri · Saat başı güncelleme" rozeti var. Canlı API
İstanbul için **8.000 TL/m²** diyor. Ayrıca "Sahibinden + Hepsiemlak
ilanlarından" (`:74`) — Sahibinden hattı 3 aydır bot-bloke (`index.ts:524`),
gerçek kaynak ağırlıklı olarak emlakjet. "957 ilçe / 65.000 mahalle" de sabit;
üretimdeki gerçek kapsam ~11.7 bin mahalle.

### 13. `content/` + `background/` sıfır test
56 spec dosyasının hiçbiri `src/content/` veya `src/background/` altından import
yapmıyor. Testsiz kritik kod ~4.400 satır: üç detay parser (hepsiemlak 874,
sahibinden 835, emlakjet 531), iki liste parser, `service-worker.ts` (388) ve
`scraping-runtime.ts` (374) — yani **5, 6 ve 7 numaralı bulguların tamamının
yaşadığı yer**. Sprint B.5 backend'in en yük taşıyan parser'ını kapattı; veri
GİRİŞ katmanı hâlâ açık.

### 14. `site/` sıfır davranış testi
`site/package.json`'da `test` script'i yok; CI yalnızca `astro check` + `build`
çalıştırıyor. Kritik dosyalar `@ts-nocheck` altında (`detay.astro:88`,
`[il].astro:271`), endpoint yolları düz string — yani 2, 3 ve 8 numaralı
bulguların hiçbirini mevcut kapı yakalayamaz.

> Düzeltme: `npm run lint:catch` (Sprint B) **site/src'i zaten tarıyor**;
> `harita-init.ts`'in 14 boş catch'i baseline'da kayıtlı. Önceki incelemede
> "site kapsam dışı" denmişti, yanlış.

---

## Uygulama planı

### Sprint C — Site (P0 ağırlıklı)

**C.1 Harita altlığı** — Esri gri altlığa geç (`harita-init.ts:1786`,
`src/lib/basemaps.ts:51,75`), atıf metnini güncelle. Ardından altlık için
görünür sağlık kontrolü ekle.

**C.2 `/veri` yönlendirmesi** — `[il]/[ilce].astro` (+ mahalle) sayfalarını
`getStaticPaths` ile üret; `_redirects`'teki Netlify sözdizimini kaldır;
bilinmeyen il için gerçek 404. Sitemap'in vaat ettiği 90 URL'in içerik döndüğü
doğrulanmalı.

**C.3 Harita popup'ı** — `harita-init.ts:247` → `/fiyat/toplu-ilce-ozet/:il`,
`data.mahalleler` → `data.ilceler`.

**C.4 Yokluk kararı** — `/harita/trend` ve `/gelisen-bolgeler` için "veri yok"
durumunu haritada **görünür** kıl (daire çizme ya da ayrı gri "veri yok" sınıfı,
efsanede karşılığıyla). Statik skorların statik olduğunu etikette belirt.

**C.5 Otoyol** — `extract-otoyollar.mjs`'i çalıştırıp çıktıyı `public/geo`'ya
koy, ya da düğmeyi kaldır. `finally { durumGuncelle("") }` hata mesajını
silmesin.

**C.6 Sprint C testleri** (asıl kalıcı kazanç) — `site/` altına vitest:
- **Endpoint sözleşme testi**: `site/src` içindeki tüm `${API_BASE}/...`
  yollarını statik olarak çıkar, backend route tablosuna karşı doğrula.
  3 numaralı bulgu bu testle bir daha asla üretime çıkmaz.
- **Boş durum testi**: 5 kritik sayfa için API boş/hatalı yanıtta anlamlı boş
  durum gösteriliyor mu.
- **Yönlendirme testi**: `getStaticPaths` çıktısı ile `sitemap.xml` URL kümesi
  birebir örtüşüyor mu (2 numaralı bulgu).
- CI'da `site` job'ına `npm test` ekle.

**C.7 Dürüstlük** — `veri/index.astro` FEATURED tablosunu canlı
`/fiyat/toplu-ozet`'e bağla ya da "örnek" diye etiketle; kaynak listesini
gerçek kaynaklarla güncelle; kapsam sayılarını canlı sayımdan al.

### Sprint D — Uzantı + backend sözleşmesi

**D.1 `koord_kaynagi`** — `IlanIngestSchema`'ya ekle, `ValidIlan` kesişim tipini
kaldır, `sozlesme-alan-yolculugu.spec.ts`'e assert ekle (SELECT'te zaten var).
Aynı taramada `ilanTarihi`'nin batch/katkı INSERT'lerinde olmadığını da düzelt.

**D.2 Koordinat fallback'i** — `scraping-runtime.ts` batch yolunu
`service-worker.ts`'teki mahalle-merkez fallback'iyle eşitle; tercihen tek ortak
fonksiyona indir (backend'deki `veri-katmani.ts` refactor'unun uzantı karşılığı).

**D.3 Ölü çağrılar** — dört endpoint uyumsuzluğunu düzelt ya da çağrıyı kaldır.
`POST /v1/bildirim/kontrol` için karar: route'u aç mı, uzantıdaki çağrıyı mı sil.
`gercek-satis` hattı ya tamamlanmalı ya sökülmeli (write-only Dexie tablosu ve
boolean index hatası dahil).

**D.4 Giriş katmanı testleri** — `src/content/*-liste.ts` ve `src/background/`
payload kurucuları için fixture testi. Sprint B.5'in uzantı karşılığı; kabul
ölçütü aynı: **düzeltmeyi geri al, test kırılsın.**

**D.5 Workers saat tuzağı** — `harita.ts:41` ve `proxy.ts:359`'u istek içine
taşı. Modül seviyesinde `Date.now()`/`new Date()` kullanımını yasaklayan bir
kontrol ekle (`scripts/catch-disiplini.mjs` ile aynı desende, `backend/api/src`
kapsamında).

---

## Doğrulama

```bash
npm run lint && npm run lint:catch && npm test
```

```bash
cd site && npm run check && npm test && npm run build
```

Canlı sözleşme (deploy sonrası):

```bash
curl -s "https://cadastrum-api.cadastrum-tr.workers.dev/v1/harita/analiz?ilceKodu=118&analizTip=1&yil=2024" | head -c 200
```

```bash
curl -sL -o /dev/null -w "%{http_code}\n" "https://cadastrum.com.tr/veri/istanbul/catalca"
```

Her madde için kabul ölçütü Sprint A/B ile aynı: **düzeltmeyi geri al, test
kırılsın.** Kırılmıyorsa test yanlış şeyi ölçüyordur.
