# Geliştirme Planı 3 — Protokoller, teknoloji ve odak

**Tarih:** 2026-09-10 · **Durum:** öneri, uygulanmadı
**Öncekiler:** `MIMARI-PLAN.md` (M1/A1/A2/A3) · `GELISTIRME-PLANI-2.md` (Ö1–Ö4 kapandı)

---

## 0. Bu plan neden yazıldı

Soru üç parçalıydı: **hangi protokoller olmalı, hangi teknolojilerle
geliştirmeliyiz, hangi özelliklere odaklanmalıyız.**

Cevabı yazmadan önce çalışma ağacına bakıldı ve orada hem projenin en değerli
fikri hem de en tehlikeli hatası yan yana duruyor. Plan bu ikisinin üzerine
kuruluyor; soyut bir teknoloji listesi değil.

### Ağaçtaki iyi şey — gerçek satış geri besleme döngüsü

`0037_gercek_satislar.sql` + `routes/gercek-satis.ts` + uzantı tarafındaki
`GercekFiyatGirisKarti`. Kullanıcı bir parseli alıp sattıktan sonra **gerçek
fiyatı** giriyor.

Bu, projenin bugüne kadar üretemediği tek şeyi üretir: **gerçek işlem fiyatı.**
Şu ana kadar her ölçüm *ilan fiyatı* üzerineydi ve ilan fiyatı pazarlık öncesi
bir istek. Doğruluk tavanının bir kısmı buradan geliyor olabilir ve bu hiç
ölçülmedi.

### Ağaçtaki tehlikeli şey — konut backtest'i kendi kendini ölçüyor

`test/backtest/konut-engine.spec.ts` konut doğruluğunu **±%20 = 66,4** olarak
raporluyor ve bu sayı `data/backtest-esik-real.json`'a **eşik olarak** yazılmış.
Arsa 27,6 · tarla 41,8 iken konut 66,4 — yani motorun en iyi kategorisi.

Bu sayı gerçek değil. Üç ayrı kanıt:

**1. Ölçülen veri sentetik.** Kaynak `scripts/seed-ai-baseline-01.sql` ve
satırların etiketi `kaynak='knn-smoothing'`. Bu, `mahalle_baseline_ai`
tablosunun kendisi — ilan değil, türetilmiş değer. Backtest, **AI tablosunun
ilçe medyanıyla aynı AI tablosunun mahalle değerini** tahmin ediyor. Ölçtüğü
şey doğruluk değil, sentetik bir tablonun kendi içindeki düzgünlüğü.

**2. `konut` kolonu `arsa`'dan türetilmiş.** 61.534 ortak anahtarda ölçüldü:
konut/arsa oranı q25 **0,509** · medyan **1,000** · q75 = q90 **1,300**;
kayıtların **%26,8'inde iki değer birebir aynı**. Yani bağımsız bir bilgi
değil, arsa değerinin kaba bir çarpan ızgarasından geçmiş hâli.

> *Düzeltme:* ilk okumada "konut kolonu arsa'nın kopyası" demiştim. Ölçünce
> daha dar çıktı: %26,8'i birebir kopya, kalanı sabit çarpanlarla türetilmiş.

**3. `medyanApe = 0` bir sonuç değil, alarm.** Sebebi ölçüldü: **61.534 konut
satırının %61,1'i kendi ilçesinin medyanına birebir eşit.** İlçe medyanıyla
tahmin etmek, kayıtların %61'inde tam isabet demek — ve raporlanan
`within10 = 63,4` bu sayıyla neredeyse birebir örtüşüyor. "İsabet" diye
ölçülen şey, tablonun kendi düzgünlüğü.

**Ayrıca üçüncü test tautolojik.** Adı *"Gerçek benchmark profillerinde…"* ama
`gercekDegerTL` motorun kendi katsayılarıyla hesaplanıyor:

```ts
gercekDegerTL: 120 * 0.82 * 70_000 * 1.08 * 1.15 * 1.15
//                   ↑net m²      ↑kat  ↑yaş  ↑site  — hepsi motorun katsayısı
```

Test mutasyona duyarlı (katsayı değişirse kırılır) ama **doğruluk ölçmüyor** —
motorun kendisiyle tutarlı olduğunu ölçüyor. Sorun testin varlığı değil, **adı
ve raporlandığı yer**: "gerçek benchmark" diye anılıp ±%20 = 100 üretiyor.

> Bu tam olarak projenin aylardır ayıkladığı hata sınıfı ve bu kez **ölçüm
> kapısının içinde**. Commit edilirse sistemin en iyi görünen sayısı uydurma
> olur.

**Doğrulandı (2026-09-10):** `npm run backtest:real` koşturuldu —
`2 dosya / 13 test geçti, çıkış kodu 0`. Yani konut backtest'i doğruluk
kapısının **içinde ve yeşil**. Kapı bu sayıyı reddetmiyor, onaylıyor.
Arsa ±%20 **27,6** · tarla ±%20 **41,8** değişmedi.

### Üçüncü bulgu — `spatial-radius` ölçülmeden en üst güvene alınmış

`guven-motoru.ts` diff'inde `spatial-radius` baseline puanı **58** yapılmış —
`ilanGozlem-mahalle` ile aynı, en üst kademe. Oysa Ö1'de ölçüldü ve bu katman
mahalle-merkez koordinatlarıyla **zarar veriyordu**; o yüzden
`spatial-emsal.ts`'e `koordKaynagi === "mahalle-merkez"` atlaması kondu.
58 puanın ölçümü yok. (`data/o1-spatial-katman-olcum.json`)

Aynı dosyada ayrıca **yarım kalmış bir kodlama onarımı** var: bazı Türkçe
metinler düzeltilmiş (`ağırlıklı`), bazıları hâlâ bozuk (`�l�e emsali`,
`B�lge ortalamas�`). Bunlar kullanıcıya görünen metinler.

---

## 1. Protokoller — hangileri olmalı

Mevcut P1–P7 (`MIMARI-PLAN.md §3`) yerinde duruyor. Bugünkü bulgular **üç
boşluk** gösteriyor ve üçü de kod olarak zorlanabilir.

### P8 — Ölçümün gerçeği bir GÖZLEM olmalı, türetilmiş değer değil

> Bir hold-out'un `gerçek` tarafı, dış dünyadan gelen bir gözlem olmalıdır.
> Modelin, tablonun ya da başka bir tahmincinin ürettiği değer **gerçek yerine
> geçemez.**

Konut backtest'i tam olarak bunu ihlal ediyor. Aynı ihlal daha önce iki kez
yakalandı (`mahalle_baseline_ai` "AI değil" bulgusu; `ilce-baseline-ai` %3,4).

**Zorlama biçimi:** her backtest, gerçek tarafının kaynağını **beyan eder**
(`gercekKaynagi: "ilan" | "gercek-satis" | "turetilmis"`). `turetilmis` beyanı
ile eşik dosyasına yazmak **yasak** — kapı hata verir.

### P9 — Mükemmel skor sızıntı alarmıdır

> `medyanApe < 5` ya da `within10 > 50` çıkan bir ölçüm, kutlanmaz;
> **sızıntı şüphesiyle durdurulur.**

Emlak fiyat tahmininde bu aralıklar fiziksel olarak erişilemez. Konut
backtest'i `medyanApe = 0` üretti ve kimse durmadı.

**Zorlama biçimi:** `olc()` içinde eşik kontrolü; ihlalde
`SIZINTI ŞÜPHESİ — gerçek taraf modelden türetilmiş olabilir` hatası.

### P10 — Testin adı, ölçtüğü şeyi söylemeli

> Kendi kendine tutarlılığı ölçen bir test, **doğruluk** diye anılamaz;
> raporlanan doğruluk sayılarına karışamaz.

P6 ("atıf yalanı ile tahmin gücü ayrı sorular") ilkesinin testlere uzantısı.
Tutarlılık testleri değerlidir — monotonluk, invaryant, şema — ama adları
`invaryant` / `tutarlilik` olur, `gerçek benchmark` olmaz.

### P11 — Eşik, kaynağını taşır

> `backtest-esik-real.json`'daki her segment, o sayının **hangi veriden ve
> hangi tarihte** çıktığını taşır.

Bugün konut eşiği dosyada duruyor ve neyi ölçtüğü dosyadan anlaşılmıyor.
Alan: `gercek_kaynagi`, `olculdu`, `n`.

### P12 — Ölçülmemiş katman en üst güven kademesine giremez

> Güven puanı bir ölçüme referans vermek zorundadır. Referansı olmayan katman,
> zincirin en altındaki varsayılan puanı alır.

`spatial-radius = 58` bunu ihlal ediyor.

**Zorlama biçimi:** `guven-motoru.ts`'de katman → puan tablosu, yanında
`olcumDosyasi` alanı taşır; dosya yoksa puan tavanı 30.

---

## 2. Teknolojiler — dürüst cevap

**Yığın değişmemeli.** Sorun teknolojide değil, veride. Bunu söylemek bir
kaçamak değil, ölçülmüş bir sonuç: yedi bağımsız deneme (kapsam, kalibrasyon,
özellik, hedonik model, hukuki eşik, segment cezası, düşük bant düzeltmesi)
doğruluğu oynatmadı. Yeni bir çatı, yeni bir veritabanı ya da bir LLM bunların
hiçbirini değiştirmez.

| katman | bugün | karar | gerekçe |
|---|---|---|---|
| Uzantı | React + TS + Vite + Dexie | **kal** | Sorun burada değil |
| API | Hono + Cloudflare Workers | **kal** | Uygun; darboğaz kod değil kota |
| Veri | D1 (SQLite), ücretsiz katman | **kal, ama ölç** | 5M okuma/gün iki kez doldu; ölçmeden büyütmek israfı pahalılaştırır |
| Ölçüm | Vitest + hold-out backtest | **kal, sertleştir** | P8–P11 kapıları buraya giriyor |
| ML | yok | **kapalı kalsın** | Gerçek işlem fiyatı olmadan model, ilan fiyatını öğrenir |
| LLM | yalnızca açıklama (A4, bağlı değil) | **fiyata dokunmaz** | MIMARI-PLAN §4.2 |

### Ücretli D1'e geçilmeli mi — henüz hayır

Bugünkü kesinti (`7500: daily row read limit`) bir kapasite sorunu gibi
görünüyor ama değil: **bütçeyi kimin yediğini bilmiyoruz.** `pipeline-health`
bunu ölçmesi için kuruldu ve ölçmüyor —

```
grep okuma_butcesi_gunluk  →  migration (tanım) + pipeline-health (OKUMA)
                              YAZAN KOD YOK
```

Satır bulunamayınca `okunanSatir = 0` oluyor ve kontrol `0 <= 3.500.000` ile
**her koşumda yeşil** dönüyor. Yani 2026-09-04 kesintisinden sonra kurduğumuz
alarm, kurulduğu günden beri sahte. Limit bugün yine doldu, pano yine yeşildi.

Aynı dosyada bu bir **sınıf hatası**: üst-sınırlı üç kontrol (bot engeli, satır
 402'deki günlük okuma, il sayısı) veri yokluğunu başarı sayıyor. Alt-sınırlı
kontroller (`>= min`) veri yokken doğru şekilde kırmızı dönüyor. Eksik olan
üçüncü durum: **"bilinmiyor".**

---

## 3. Odak — hangi özellikler

Öncelik sırası, "en çok değer üreten" değil **"olmadan diğerleri ölçülemeyen"**
sırasıdır.

```
G1 ölçüm kapısını onar ──► her şey (bozuk kapı yanlış sayıyı onaylıyor)
G2 okuma bütçesi ───────► her D1 ölçümü (limit doluyken sayı alınamıyor)
G3 gerçek satış döngüsü ► doğruluk tavanının test edilebilir tek yolu
G4 konut kararı ────────► G1'e bağlı
G5 SLO dürüst ölçüye ───► bağımsız
G6 dağıtım ─────────────► G5'ten sonra
```

---

### G1 — Ölçüm kapısını onar (önce bu)

| # | iş | kabul |
|---|---|---|
| G1.1 | Konut backtest'i eşik dosyasından **çıkar**; `data/konut-backtest-sizinti.json` olarak sonucu ve gerekçesini yaz (P3 — negatif sonuç silinmez) | `backtest-esik-real.json`'da konut yok |
| G1.2 | P9 sızıntı alarmını `olc()` içine koy | `medyanApe = 0` ile koşum **hata verir** |
| G1.3 | P8 beyanını zorunlu kıl: her backtest `gercekKaynagi` bildirir | `turetilmis` beyanı eşiğe yazamıyor |
| G1.4 | Tautolojik testi yeniden adlandır: `"Gerçek benchmark…"` → `"Hedonik katsayı tutarlılığı (invaryant, doğruluk DEĞİL)"` | ad ölçtüğü şeyi söylüyor |
| G1.5 | P11: eşik girdilerine `gercek_kaynagi` + `olculdu` + `n` | mevcut arsa/tarla girdileri de doldurulur |
| G1.6 | `spatial-radius` puanını 58'den ölçülmüş kademeye indir; P12 kapısını ekle | `o1-spatial-katman-olcum.json`'a referans var |
| G1.7 | `guven-motoru.ts`'deki bozuk kodlamayı bitir (`�l�e`, `B�lge`) | kullanıcıya bozuk metin gitmiyor |

**Mutasyon (P4):** G1.2 için — sızıntı alarmını kaldır, konut backtest'ini geri
koy; kapı **geçmemeli**. Geçerse alarm çalışmıyordur.

---

### G2 — Okuma bütçesini gerçekten ölç

| # | iş | dosya |
|---|---|---|
| G2.1 | `wrapD1` her çağrının `meta.rows_read` / `rows_written` değerini biriktirsin | `lib/db-timing.ts` (sarmalayıcı zaten `meta`'ya erişiyor) |
| G2.2 | İstek/cron sonunda toplam `okuma_butcesi_gunluk`'a `waitUntil` ile yazılsın | `katman-telemetrisi.ts` deseni |
| G2.3 | `kaynak` kolonu (cron adı / route yolu) — "bugün bütçeyi kim yedi" ancak böyle cevaplanır | migration 0038 |
| G2.4 | `wrapD1` tüm cron yollarına uygulansın (şu an "seçici kullanın" notuyla birkaç uçta) | `index.ts` |
| G2.5 | **Sınıf düzeltmesi:** `KontrolSonucu.gecti: boolean` → `durum: "gecti" \| "kaldi" \| "bilinmiyor"`; veri yokluğu yeşil olamaz | `pipeline-health.ts` |

**Mutasyon (P4):** `okuma_butcesi_gunluk` boşken sağlık kontrolü yeşil dönerse
test kırılır. Test **düzeltmeden önce yazılıp kırmızı görülmeli.**

**Kabul:** 24 saat sonra tabloda sıfırdan büyük gerçek sayı var · kırılım
tüketen kaynağı adıyla gösteriyor · `backtest:real` **birebir aynı** (bu faz
motora dokunmuyor).

**Kabul — sayacın kendisi doğrulanır (P4'ün ölçüm aletine uygulanması):**
`Σ okuma_butcesi_gunluk.satir_okuma` ile Cloudflare'in bağımsız sayacı
`wrangler d1 info` → `rows_read_24h` karşılaştırılır. **Kapsam oranı ≥ %80**
olmalı. Altındaysa sayaç tüketimin önemli bir kısmını görmüyor demektir ve
sağlık kontrolünün "geçti" hükmü desteklenemez.

> **Uygulama notu (2026-09-11):** deploy sonrası `/v1/fiyat/*` uçları aralıklı
> 500 döndü. `wrangler tail`: `D1_ERROR: … exceeded D1's free tier daily row
> read limit`. `wrangler d1 info`: **rows_read_24h 6.699.173**, yalnızca
> **1.285 sorgudan** — sorgu başına ortalama ~5.200 satır, yani tam taramalar.
> Kesinti deploy'dan kaynaklanmıyor; limit üçüncü kez doldu.
>
> Aynı inceleme G2'nin ilk sürümünde bir boşluk gösterdi: `first()` çağrıları
> "metasiz" sayılıp maliyeti yok sayılıyordu, oysa cron yolundaki COUNT(*) tam
> taramalarının neredeyse tamamı `first()` kullanıyor. Düzeltildi — Cloudflare
> belgesi `first()`'ün sorguyu değiştirmediğini söylüyor, yani `all()` üzerinden
> çalıştırmak okuma maliyetini artırmıyor.
>
> pipeline-health'in kendi payı tahmini: ~5 tam tarama × 67k ≈ **~340k/gün**
> (bütçenin ~%7'si) — ana tüketici değil. Asıl tüketici G2 ölçümüyle belli olacak.

---

### G3 — Gerçek satış döngüsü: projenin tek yeni bilgi kaynağı

Ağaçtaki `gercek_satislar` altyapısı doğru fikir. Ama **fiyata bağlanmadan
önce** üç şey gerekiyor; yoksa ölçülmemiş bir çarpanı geri getirmiş oluruz.

| # | iş | gerekçe |
|---|---|---|
| G3.1 | Toplama ucu bitirilsin, **fiyata dokunmadan** | A2'de hukuk ajanı için konan kural: ölçülemeyen bilgi fiyata değil nota gider |
| G3.2 | **Zehirlenme koruması**: mahalle başına min. n, medyan (ortalama değil), uç değer kırpma, aynı kullanıcıdan tekrar sayılmaz | Tek kötü niyetli giriş bir mahallenin offsetini kaydırabilir |
| G3.3 | Girilen gerçek fiyatlar **ayrı bir hold-out** olarak biriksin; motorun o kayıtlardaki hatası ölçülsün | İlan fiyatı ile işlem fiyatı arasındaki farkı ilk kez ölçer |
| G3.4 | Ancak G3.3 pozitifse offset motora bağlansın | P1 — ölçülmemiş değişiklik yok |

**Bu maddenin asıl değeri G3.3.** Bugüne kadarki bütün doğruluk ölçümleri
*ilan fiyatı* üzerineydi. İlan fiyatı pazarlık öncesi bir istek; gerçek işlem
ondan sistematik olarak farklı olabilir. Eğer öyleyse **±%20 tavanının bir
kısmı motorun hatası değil, hedefin gürültüsüdür** — ve bu, yedi negatif
sonucun ortak açıklaması olabilir.

**Karar kuralı — ölçümden ÖNCE:** n ≥ 200 gerçek satış birikince ölçülür.
İlan-hedefli hata ile işlem-hedefli hata arasındaki fark %5 puandan azsa
"ilan fiyatı iyi bir vekil" yazılır ve konu kapanır; fazlaysa hedef değişir.

**Gizlilik:** tabloda parsel no ve koordinat yok, alan **bant** olarak
tutuluyor. Bu doğru kurulmuş; korunur.

> **Uygulama notu (2026-09-11) — G3.1 ve G3.3 kodu tamam, veri toplanmıyor.**
>
> "Doğru fikir" diye devralınan altyapı çalışmıyordu ve çalışsaydı ölçülemez
> veri toplayacaktı:
>
> - **Tablo üretimde YOKTU.** Migration 0037 hiç uygulanmamıştı; route deploy
>   edilmişti ve her POST'a 503 dönüyordu. Uzantı kayıtları yerelde tuttuğu
>   için veri kaybı yok — ama özellik üretimde hiç çalışmamıştı. Uygulanmamış
>   migration yerinde düzeltildi.
> - **500 TL/m² alt sınırı ölçümü bozacaktı.** Korpusta tarla ilanlarının
>   **%36,2'si** (5.734/15.820) bu sınırın altında — tam da motorun en çok
>   yanıldığı ucuz kırsal bant. Hold-out motoru olduğundan iyi gösterirdi.
>   Sınır 1 TL/m²'ye çekildi (korpus minimumu).
> - **Kategori, katman ve iskonto yoktu** — gerçek satış hiçbir segmentle ve
>   hiçbir katmanla kıyaslanamazdı.
> - **Yer adları `.toLowerCase()` ile yazılıyordu** ("çatalca" vs korpus
>   "catalca") — hiçbir satır motorun anahtarıyla eşleşmezdi.
> - **`/ozet` "admin gerektirir" diyordu ama yetki kontrolü YOKTU.** Ayrıca
>   ortalama ve asimetrik bias kullanıyordu; medyana çevrildi.
>
> **Yeni bulgu — iskonto modeli hiç ölçülmemiş.** Motorun `beklenenPerM2`
> değeri kapanış hedefli ve `dinamikIndirimOrani` ile %6-24 iskontolu. Backtest
> iskontoyu geri ekleyip ilanla kıyaslıyor; iskontonun kendisi hiç sınanmadı.
> Ölçüm betiği bunu **ikincil** ölçüm olarak raporluyor (aynı kayıtlarda
> iskontolu vs ilan eşdeğeri). Önceden yazılmış karar kuralını etkilemiyor.
>
> **Ölçüm betiği:** `npm run olcum:gercek-satis`. n < 200 iken karar üretmez.
> Karar kuralını koruyan test ilk yazımda mutasyona duyarsızdı (girdisini
> korumaya çalıştığı sabitten türetiyordu) — düzeltildi.

---

### G4 — Konut: ölç ya da kapat (üçüncü seçenek yok)

G1.1'den sonra konut yeniden **ölçülmemiş** duruma döner. Ö2'deki karar kuralı
aynen geçerli:

1. Gerçek konut ilanından hold-out kurulabiliyorsa (n ≥ 300) → **ölç.**
2. Kurulamıyorsa → **kategori sayı döndürmez**, gerekçe döndürür.

Korpusta konut ilanı **0** (tarayıcı bu kategoriyi toplamıyor). Yani bugün
ikinci dal işliyor. Tarayıcıya `satilik-konut` eklemek kategoriyi kurtarır ama
yeni bir tarama hattı demektir ve kapsam büyütmenin doğruluğa katkısı ölçüldü,
düz çıktı. **Öneri: kapat, talep gelirse ölçülebilir hâle getir.**

Aynı kural **mesken 2,5× çarpanı** için de geçerli — `nitelikCarpani` bir
MESKEN/BİNA parseline 2,5× uyguluyor, hiç ölçülmedi. Ölçülemiyorsa **1,0'a
çekilir** ve nitelik bilgisi `veriKalitesiNotlari`'na yazılır.
(`data/o2-konut-kategorisi-olcum.json`)

---

### G5 — SLO'yu dürüst ölçüye taşı

`bias_mutlak_max: 10` hedefi **çarpık metrik** üzerinden konmuştu. Medyan
sapmaya göre arsa −9,72 / tarla −0,72; hedef fiilen zaten karşılanıyor ve bu
bir kazanım değil, ölçü değişimi.
(`data/bias-metrigi-carpikligi.json`)

- G5.1 SLO'nun bias ayağı **medyan sapmaya** taşınır.
- G5.2 Ortalama bias **silinmez** — "uç kayıt göstergesi" olarak kalır (P3).
- G5.3 Eşik konmadan önce **oynaklık ölçülür**: hold-out tohumu değiştirilerek
  5 koşum, dağılım yazılır. Tek koşumun sayısına göre eşik koymak bu projede
  zaten bir kez yapılan hata.

---

### G6 — Dağıtım

- G6.1 `npm run backtest:real:yaz` ile kalibrasyon tablosunu tazele.
- G6.2 Uzantıyı derle ve yayınla — **yeni yüzey değil**, mevcut yüzeyin
  ölçülmüş sayılarla güncellenmesi.
- G6.3 Tablonun tazelenme tarihi uzantıda görünsün; eskimesi sessiz olmasın.
- G6.4 `npm run test:smoke` dağıtım sonrası koşulsun (ağaçtaki `smoke-test.mjs`
  bunun için doğru araç).

---

## 4. Ağaçtaki diğer işler — karar

| iş | karar | gerekçe |
|---|---|---|
| `gercek_satislar` altyapısı | **tut**, G3 kapsamında bitir | Projenin tek yeni bilgi kaynağı |
| Workers modül seviyesi `Date` kapısı (`catch-disiplini.mjs`) | **tut** | Gerçek bir hata sınıfı: isolate ayakta kalırken tarih donuyor |
| `AnalizPanel` / `IlanKarti` bileşen ayrıştırması | **tut** | Yeni yüzey değil, mevcut yüzeyin bölünmesi (−252 satır → +261 satır, testli) |
| `FirsatAvci` + `CanliFirsatAvcisi` silinmesi | **tut** | 641 satır ölü kod; A1 envanterinin gereği |
| `smoke-test.mjs`, `content-parsers.spec.ts` | **tut** | Kapsam artıyor, iddia üretmiyor |
| `zaman-serisi-retroaktif` | **tut, ama G2'den sonra** | Tüm `ilanlar`'ı ay dilimlerine bölüyor — okuma maliyeti önce ölçülmeli |
| Konut backtest'i + eşiği | **çıkar** (G1.1) | Sentetik veriyle sentetik veri ölçülüyor |
| `spatial-radius = 58` | **düşür** (G1.6) | Ölçüm zarar gösterdi, puan tersini söylüyor |

---

## 5. Bu planın DIŞINDA (gerekçeli)

1. **Doğruluğu doğrudan artırmayı yeniden denemek.** Yedi negatif ölçüm var.
   G3.3 yeni bir sinyal vermezse bu kapı kapalı kalır.
2. **Yeni kullanıcı yüzeyi.** Yüzey dondurma sürüyor.
3. **Ücretli D1 / yeni veritabanı.** G2 tüketiciyi söylemeden limit büyütmek,
   aynı israfı pahalılaştırmaktır.
4. **ML hattı.** Gerçek işlem fiyatı biriktikten sonra tartışılır; ilan
   fiyatından model eğitmek ilan fiyatını öğrenmektir.
5. **LLM'in fiyat üretmesi.** Ölçülebilirliği yok eder.
6. **Konut için yeni tarama hattı.** G4'te kapatıldı; talep gelirse açılır.

---

## 6. Kabul: bu plan ne zaman başarılı sayılır

1. Eşik dosyasındaki hiçbir sayı türetilmiş veriden gelmiyor; her girdi
   kaynağını taşıyor (P8, P11).
2. Sızıntı alarmı çalışıyor — mutasyonla doğrulandı (P9).
3. Hiçbir güven kademesi ölçüm referansı olmadan üst kademede değil (P12).
4. `okuma_butcesi_gunluk` gerçek sayı taşıyor; bütçeyi tüketen kaynak adıyla
   biliniyor; sağlık panosu veri yokluğunda yeşil dönmüyor.
5. Gerçek satış döngüsü veri topluyor, **fiyata dokunmuyor**, ve ilan-hedefli
   hata ile işlem-hedefli hata farkı ölçülmüş.
6. Konut ya ölçülmüş ya kapalı; mesken çarpanı ya ölçülmüş ya 1,0.
7. SLO'nun bias ayağı medyan sapmaya dayanıyor, eşik ölçülmüş oynaklıktan.
8. Negatif çıkan her ölçüm `data/*-negatif-sonuc.json` olarak yazılmış (P3).
