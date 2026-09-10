# Cadastrum — Mimari ve Geliştirme Planı

**Tarih:** 2026-09-07 · **Durum:** öneri, uygulanmadı

---

## 0. Bu planın dayandığı ölçümler

Bu plan sezgiye değil, son iki günde yapılan ölçümlere dayanıyor. Her biri
`data/` altında duruyor ve tekrar üretilebilir.

| ölçüm | sonuç | dosya |
|---|---|---|
| Kapsam büyütme | korpus **+%57**, havuzlu mahalle **×2** → arsa ±%20 **+1,7** | `faz4-kapsam-negatif-sonuc.json` |
| Kalibrasyon | en iyi global ölçek → **+0,1 puan** | backtest çıktısı |
| Özellik ekleme (başlık) | motor kullanamadı; **eleme** olarak kullanıp zarar verdi | `segment-duzeltme-negatif-sonuc.json` |
| Model değişimi (hedonik) | motordan **kötü** (arsa 23,8 vs 26,7) | `hedonik-regresyon-negatif-sonuc.json` |
| Katman seçimi | motor **doğru** seçiyor; ilk kıyasım geçersizdi | `katman-secimi-olcum.json` |
| KNN/kırsal katman | kaldırmak **zarar** (tarla −8,7 puan) | `faz2-3-knn-kirsal-katman-olcum.json` |

**Mevcut doğruluk:** arsa ±%20 **26,7** · bias +19,1 — tarla ±%20 **43,9** · bias +11,0
**Naif taban** (sadece mahalle medyanı): arsa 24,9 · tarla 24,4

### Tek cümlelik teşhis

Motorun çarpan zinciri gerçek iş yapıyor (tarlada naif tabana göre **+19,5 puan**),
ama doğruluğu artırmanın bilinen dört yolu da tükendi. Sebep ölçüldü:
**mahalle içi fiyat yayılımı IQR/medyan %75.** Aynı mahalledeki iki arsa,
medyanın dörtte üçü kadar farklı olabiliyor ve elimizdeki hiçbir özellik bunu
açıklamıyor.

**Sonuç: ±%20 ≈ 27 bu problemin doğal seviyesi. Mimari yön, daha iyi bir sayı
üretmek değil, sayının etrafındaki BELİRSİZLİĞİ ve BAĞLAMI yönetmek olmalı.**

---

## 1. Veri Yönetimi

### 1.1 Şu anki gerçek

| | korpus (yerel) | üretim (D1) |
|---|---|---|
| ilan | 66.061 | 34.476 aktif |
| koordinat | %93,8 | %87,6 (ama %93'ü mahalle merkezi) |
| başlık | 14.899 (%22,6) | 2.258 (%6,5) |
| imar durumu | ~0 | 2.439 (%7,2) |
| havuzlu mahalle (arsa, ≥5) | 2.928 / 65.718 = **%4,5** | — |

### 1.2 İlke: tek yönlü veri akışı, boşluk doldurma, asla ezme

```
kaynak (emlakjet)
   │  liste JSON-LD  ─────────────┐
   │  detay sayfası  ──┐          │
   ▼                   ▼          ▼
korpus SQL  ◄── zenginleştirme ── başlık/koordinat
   │  (tek biçim: INSERT OR IGNORE ... VALUES — okuyucular buna bağlı)
   ├──► backtest       (ölçüm)
   ├──► kapsam raporu  (tarama hedefi)
   └──► korpus-uretime-guncelle.mjs ──► üretim D1
              (UPDATE ... WHERE <alan> IS NULL — üretim kazanır)
```

**Üç kural, üçü de acı deneyimle öğrenildi:**

1. **Yazdığın her kolonu geri oku.** `sqlYaz` dosyanın tamamını bellekten
   yeniden yazıyor; `sqlKayitlariYukle`'de okunmayan kolon bir sonraki
   koşumda **sessizce silinir**. Koordinatı %3,9'a düşüren buydu; başlık aynı
   tuzağa düşmesin diye `test/korpus-baslik.spec.ts` sözleşmeyi kilitliyor.

2. **Seed dosyasının biçimi bir API'dir.** `emlakjet-data-turkiye.sql` hem
   üretime seed hem backtest/kapsam raporunun okuduğu korpus. `ON CONFLICT DO
   UPDATE`'e çevirmek denendi ve geri alındı: `COALESCE(...)` parantezleri
   satır ayrıştırıcısına sahte satır gibi görünüyor, ölçüm hattı sessizce
   bozulurdu. Güncelleme ayrı dosyaya çıktı.

3. **Boşluk doldur, dolu alanı asla ezme.** Üretimdeki gerçek parsel
   koordinatı, korpusun mahalle merkezinden iyidir. Her UPDATE
   `WHERE <alan> IS NULL` ile korunuyor.

### 1.3 Yapılacaklar

| # | iş | gerekçe | ölçüt |
|---|---|---|---|
| V1 | Başlık geriye doldurmayı tamamla (133/526'da duruyor) | sıfır ek istek; sayfa zaten indiriliyor | korpus başlık ≥%80 |
| V2 | `korpus-uretime-guncelle.mjs --yaz` çalıştır | 61.836 aday; üretimde başlık %6,5 → ~%60 | üretim başlık kapsamı |
| V3 | İmar zenginleştirmesini sürdür (saatlik cron, 120/tur) | ilçe-içi arsa varyansının %60,8'i | üretim imar ≥%40 |
| V4 | `mahalle-baseline-final.json` kayıp — üreteci kur | tablo temiz clone'da denetlenemiyor; **kalıcı borç** | dosya mevcut |

**V3 hakkında dikkat:** imar %60,8 varyans açıklıyor ama başlık deneyi gösterdi
ki *korelasyon ≠ motorun kullanabilmesi*. V3 tamamlanınca A/B ölçülmeli;
kullanamıyorsa mekanizma değişmeli, veri toplamaya devam edilmemeli.

---

## 2. Motorun Çalışma Prensipleri

### 2.1 Katman zinciri (mevcut, ölçülmüş)

```
1. spatial-radius        gerçek koordinatlı emsal, yarıçap içinde
2. ilanGozlem-mahalle    n=746  ±%20 29,9  bias +10   ◄ en iyi katman
3. ilanGozlem-ilce       n=415  ±%20 21,9  bias +23
4. mahalle-baseline      n= 38  ±%20 21,1  bias +151  ◄ en zayıf, ama kaldırmak DAHA KÖTÜ
5. ilce-baseline / il fallback
```

Her katmanın üstüne: emsal ağırlıklandırma → IQR rafinasyonu → Bayesian
shrinkage (mahalle↔ilçe) → de-shrinkage γ → çarpan zinciri (alan, nitelik,
taşkın, enflasyon) → CARPAN_CAP ±%60.

### 2.2 Korunacak ilkeler (ölçümle doğrulanmış)

- **Mahalle her zaman ilçeden iyi** — 1-2 emsalle bile (arsa 26,0 vs 12,4).
  Az emsal bile konum bilgisi taşıyor. Shrinkage bu yönde ayarlı kalmalı.
- **Zayıf kaynaklı katman bile değer üretir.** MAHALLE_BASELINE'ın %2'si
  gerçek gözlem; kapatmak tarlada 8,7 puan kaybettiriyor. "Uydurma veri"
  sezgisi burada ölçümle çelişti ve ölçüm kazandı.
- **Segment farkı emsali ELEMEZ.** Eleme, seçim yanlılığı üretiyor: ucuz
  segmentler havuzdan atılınca kalan havuz pahalıya kayıyor (bias +9,7).
  Yalnızca "yol" kategorik olarak geçersiz.

### 2.3 Değişecek yön: nokta tahminden ARALIK'a

Bugün motor tek bir sayı veriyor ve yanında Q1–Q3'ü "aralık" diye gösteriyor.
Q1–Q3 **emsallerin yayılımı**, tahminin hatası değil — ve tanımı gereği %50'lik
bir aralık. Site'ta bir dönem "%95 güven aralığı" diye etiketlenmişti; düzeltildi.

**Yapılacak (M1): kalibre belirsizlik aralığı.**
Hold-out hata dağılımından, **kaynak katmanı bazında** kantiller türetilir:

```
tahmin = X, kaynak = ilanGozlem-mahalle
  → aralık [X / q90, X / q10]   (q'lar o katmanın ölçülmüş hata dağılımından)
```

Bu, doğruluğu artırmaz — **dürüstlüğü** artırır. Ve ölçülebilir bir hedefi
vardır: *kapsama oranı*. "%80 aralık" dediğimizde gerçekten kayıtların %80'i
içine düşmeli. Bugün bunu ölçen hiçbir mekanizma yok.

Altyapı hazır: ham tahmin/gerçek çiftleri backtest'te `tumOlcumler` içinde
tutuluyor (kalibrasyon süpürmesi için eklendi).

**Kabul:** aralık kapsama oranı hedefin ±5 puanı içinde, her kaynak katmanı
için ayrı ölçülmüş. `lint:catch` ≤116, backtest regresyonsuz.

---

## 3. Mühendislik Prensipleri

Bunlar bu projede zaten uygulanıyor; plan bunları **yazılı hâle getiriyor**
çünkü ihlal edildiklerinde maliyet bu oturumda defalarca ölçüldü.

### P1 — Ölçülmemiş değişiklik yok
Kapı: `npm run backtest:real`. Sezgi ne kadar güçlü olursa olsun, ölçüm
kazanır. Bu oturumda üç "kesin işe yarar" fikri ölçümde düştü.

### P2 — Sessiz başarısızlık yasağı
`npm run lint:catch`, devralınan 116'da donmuş, yeni ihlal yok. Bir `catch`
bloğu hatayı yutuyorsa, o kod çalışmadığında kimse bilmez.
*Bu oturumdaki örnekler:* koordinat silen resume, kalıcı yanan zenginleştirme
damgası, JSON kaçışı yüzünden ikiye bölünen imar sınıfı.

### P3 — Negatif sonuç silinmez, yazılır
`data/*-negatif-sonuc.json`. Aynı fikir altı ay sonra tekrar gündeme
geldiğinde sıfırdan denenmesin. Hedonik regresyon prototipi bu yüzden
backtest'te **kalıyor** — her koşumda raporlanıyor.

### P4 — Test mutasyonla doğrulanır
"Düzeltmeyi geri al, test kırılmalı." Bu oturumda bir test **tautoloji** çıktı
(TypeScript kaçışı derleme anında çözüyordu) ve yalnızca mutasyon denemesi
yakaladı.

### P5 — Kovaya düşme sebebini tahminciye mal etme
İki farklı kayıt kümesini karşılaştırıp "şu katman daha iyi" demek geçersiz.
Bu oturumda iki kez yapıldı ve iki kez düzeltildi (tavan iddiası, katman
seçimi). Kıyas **aynı kayıtlarda** yapılmalı.

### P6 — Atıf yalanı ile tahmin gücü ayrı sorular
Bir çarpanın kaynağı uydurma olabilir ama tahmin gücü gerçek olabilir
(taşkın çarpanı) ya da tersi. İkisi ayrı ayrı ele alınır: atıf düzeltilir,
çarpan ölçümle kalır veya gider.

### P7 — Yorum NEDEN'i anlatır
Kod ne yaptığını zaten söylüyor. Yorum, *neden böyle olduğunu* ve *hangi
alternatifin neden reddedildiğini* anlatır — yoksa aynı tuzak tekrar kurulur.

### P8 — Ölçümün "gerçek" tarafı bir GÖZLEM olmalı
Hold-out'un gerçek kolonu dış dünyadan gelmelidir (ilan fiyatı, gerçekleşmiş
satış). Model, tablo ya da başka bir tahminci çıktısı **gerçek yerine geçemez.**

Türetilmiş veriyle ölçüm yapılabilir — bir tablonun iç tutarlılığını görmek
meşru bir iştir — ama **doğruluk diye raporlanamaz ve eşik dosyasına
yazılamaz.**

*Kaynak:* konut backtest'i ±%20 = 66,4 raporluyordu; ölçtüğü veri
`kaynak='knn-smoothing'` etiketli türetilmiş tablonun kendisiydi
(`data/konut-backtest-sizinti.json`).
*Zorlama:* `test/backtest/olcum-butunlugu.ts` → `esikGirdisiDogrula()`.

### P9 — Mükemmel skor kutlanmaz, DURDURULUR
`medyanApe < 5` ya da `within10 > 50` çıkan bir ölçüm sonuç değil, sızıntı
alarmıdır. Emlak fiyat tahmininde bu seviye fiziksel olarak erişilemez: aynı
mahallede aynı gün iki benzer parsel %20-30 farkla satılıyor.

Bu ilkenin sinsi tarafı: ihlal **iyi haber gibi göründüğü için** fark edilmez.
Kötü sonuç sorgulanır, iyi sonuç sorgulanmaz.

*Zorlama:* `sizintiDenetle()`, `olc()` içinden her ölçümde çağrılıyor.

### P10 — Testin adı, ölçtüğü şeyi söylemeli
Kendi kendine tutarlılığı ölçen bir test **doğruluk diye anılamaz** ve
raporlanan doğruluk sayılarına karışamaz. Tutarlılık testleri değerlidir —
monotonluk, invaryant, şema — ama adları öyle olur.

P6'nın ("atıf yalanı ile tahmin gücü ayrı sorular") testlere uzantısı.

*Kaynak:* "Gerçek benchmark profillerinde … MAPE <= %15" adlı test, `beklenen`
değerini motorun kendi katsayılarıyla hesaplıyordu.

### P11 — Eşik, kaynağını taşır
`data/backtest-esik-real.json`'daki her girdi `gercek_kaynagi`, `olculdu` ve
`n` taşır. Künyesiz eşik reddedilir — bir sayının neyi ölçtüğü dosyadan
anlaşılmıyorsa o sayı regresyon koruması değil, dekordur.

### P12 — Ölçülmemiş katman, ölçülmüşün üstüne çıkamaz
Güven puanı bir ölçüme referans vermek zorundadır. Referansı olmayan katman
en fazla ölçülmüş komşusuyla **eşit** olabilir, üstünde olamaz.

*Kaynak:* `spatial-radius` 62 puanla `ilanGozlem-mahalle`'nin (58) üstündeydi;
o sıralamanın ölçümü yoktu ve ölçülen tek şey tersini söylüyordu
(`data/o1-spatial-katman-olcum.json`).
*Zorlama:* `test/guven-motoru.spec.ts` → "P12" testi, mutasyonla doğrulandı.

---

## 4. Agentic Sistem Entegrasyonu

### 4.1 Şu anki gerçek: 1.754 satır ölü kod

```
src/lib/ajanlar/   7 dosya,  647 satır  — hiçbiri üretimde çağrılmıyor
src/lib/rag/       8 dosya, 1107 satır  — 6'sı hiçbir yerden import edilmiyor
src/sidepanel/components/AjanKonseyiKarti.tsx  — HİÇBİR YERDEN MOUNT EDİLMİYOR
```

`MultiAgentOrkestrator` `fiyatTahminEt`'i çağırıyor — yani entegrasyon niyeti
var, bağlantı yok. Testleri var (`canli-demo.spec.ts` dahil), üretimde sıfır
çağrı. Bu, projedeki en büyük tek "yazıldı ama bağlanmadı" kalemi.

### 4.2 Temel mimari kural

> **Ajan fiyat sayısını DEĞİŞTİREMEZ.**

Sebep doğrudan bu oturumun dersi: motorun çıktısı ölçülebilir çünkü
deterministik ve hold-out'ta koşturulabilir. Bir LLM ara katmanı sayıyı
oynatırsa backtest anlamını yitirir ve regresyon kapısı çöker.

**Ajanın yetkisi:**

| yapabilir | yapamaz |
|---|---|
| Fiyatın hangi katmandan geldiğini açıklamak | Fiyatı değiştirmek |
| Belirsizlik aralığını yorumlamak | Aralığı daraltmak |
| Mevzuat kısıtı işaretlemek (imar, bölünemez parsel, zeytinlik) | Kısıtı fiyata çarpan olarak uygulamak |
| İlan fiyatı ile motor tahminini kıyaslamak | "Kelepir" hükmünü tek başına vermek |
| Eksik veriyi ve sonucunu söylemek | Eksik veriyi uydurmak |

Ajan **motorun yanında** durur, **içinde** değil. Değeri doğrulukta değil,
**anlaşılırlıkta ve risk görünürlüğünde**.

### 4.3 Aşamalı bağlama planı

| # | aşama | içerik | kabul ölçütü |
|---|---|---|---|
| A1 | **Ölü kodu karara bağla** | 1.754 satırın her modülü için: bağla / sil / beklet. Bağlanmayacaksa silinir — ölü kod bakım borcu. | Repo'da bağlantısız ajan/RAG modülü kalmaz |
| A2 | **Deterministik çekirdek** | `MultiAgentOrkestrator`'ın LLM'siz kısmı (fırsat iskontosu, hukuk kısıt kontrolü) → saf fonksiyon, birim testli | Backtest sayıları **birebir değişmez** |
| A3 | **Açıklama katmanı** | Motorun çıktısına gerekçe metni: hangi katman, kaç emsal, hangi çarpanlar, hangi belirsizlik | Yeni sayı üretmez; yalnızca mevcut alanları anlatır |
| A4 | **LLM sentez** (opsiyonel, Pro) | Yalnızca A2+A3 çıktısını özetler. Sıcaklık 0, çıktı şeması Zod ile kilitli, sayısal alanlar **kopyalanır, üretilmez** | Şema ihlali = hata, sessiz düzeltme yok |

**A2 kritik:** ajan mantığının çoğu (iskonto hesabı, kısıt kontrolü) LLM
gerektirmiyor. Önce o kısım deterministik hâle gelmeli ki test edilebilsin ve
maliyet/gecikme yaratmasın.

---

## 5. Agentic RAG — motora destekçi

### 5.1 RAG nereye değer katar, nereye katmaz

**Katmaz:** fiyat tahmini. Ölçüldü — mahalle medyanı zaten segment bilgisini
içeriyor, ek metin sinyali yeni bilgi getirmiyor.

**Katar:** fiyatı *açıklayan kısıtlar*. Bunlar fiyat verisi değil, **kural**
verisi ve mahalle medyanının göremediği şeyler:

| kısıt | kaynak | fiyata etkisi | ölçülebilir mi |
|---|---|---|---|
| Bölünemez asgari tarımsal parsel | 5403 s.k. m.8 | eşiğin altındaki tarla bölünemez/satılamaz | **evet** — korpusta m² var |
| Zeytinlik koruma | 3573 s.k. | yapılaşma yasağı | **evet** — ölçülen oran 0,108 |
| İmar barışı / yapı kayıt | 3194 s.k. geç. 16 | ruhsatsız yapı riski | kısmen |
| DOP kesintisi | 3194 s.k. m.18 | imar uygulamasında %45'e varan kesinti | **evet** — arsa/imar durumu |

**Buradan çıkan somut hipotez (R1):** *bölünemez asgari parsel eşiğinin
altındaki tarlalar sistematik olarak daha ucuz mu?* Mahalle içi varyansın bir
kısmını bu açıklayabilir. Korpusta m² zaten var; eşikler ile karşılaştırılıp
backtest'te ölçülebilir. **Bu, doğruluk tarafında kalan tek ölçülmemiş fikir.**

### 5.2 Mevcut RAG altyapısının durumu

| bileşen | durum | değerlendirme |
|---|---|---|
| `mevzuat-knowledge-base.ts` | **7 madde**, elle yazılmış | Çekirdek doğru, kapsam çok dar |
| `embedding-service.ts` | yerel hash n-gram (128d) + Gemini opsiyonu | Hash embedding semantik değil, **karakter benzerliği**. 7 maddede yeterli, büyürse değil |
| `spatial-rag.ts` | dense + sparse + mesafe, RRF birleştirme | Kurulum makul, **hiç kullanılmıyor** |
| `corrective-rag.ts`, `knowledge-graph.ts`, `semantic-cache.ts` | bağlantısız | A1'de karara bağlanacak |

### 5.3 RAG yol haritası

| # | iş | gerekçe | kabul |
|---|---|---|---|
| R1 | Bölünemez parsel eşiği hipotezini **ölç** | doğruluk tarafında kalan tek fikir | backtest'te ölçüldü, sonuç `data/` altında (pozitif ya da negatif) |
| R2 | Mevzuat KB'yi 7 → ~40 maddeye çıkar | mevcut kapsam bir uzman ajanı beslemeye yetmez | her madde kaynak atıflı; **atıf uydurulmaz** (P6) |
| R3 | Embedding kararı | 40 maddede hash yeterli; 400'de değil | ölçüm: geri çağırma isabeti (recall@5) |
| R4 | Citation grounding zorunlu | ajan mevzuat iddiası yapıyorsa madde numarası vermeli | atıfsız iddia = hata |

**R2 için uyarı:** mevzuat metni üretmek LLM'in en tehlikeli kullanımı —
uydurulmuş kanun maddesi, uydurulmuş fiyattan daha zararlı. Maddeler elle
girilir ve kaynak atfı doğrulanır.

---

## 6. Bağımlılık sırası

```
V1 başlık doldur ──┬──► V2 üretime taşı
                   └──► (A/B ölçümü: başlık artık zarar vermiyor mu)
V3 imar kapsamı ───────► A/B ölçümü ──► kullanılabiliyorsa mekanizma, değilse dur

M1 kalibre aralık ─────► A3 açıklama katmanı (aralığı anlatacak şey lazım)

A1 ölü kod kararı ──► A2 deterministik çekirdek ──► A3 ──► A4 (opsiyonel)

R1 bölünemez parsel ölçümü ── bağımsız, HEMEN yapılabilir
R2 mevzuat KB ──► R4 citation ──► A2 hukuk ajanı gerçek KB'ye bağlanır
```

## 7. Sırada ne var — öneri

1. **R1** — bölünemez parsel eşiği ölçümü. Doğruluk tarafında kalan tek
   ölçülmemiş fikir, veri elimizde, bir backtest koşumu.
2. **M1** — kalibre belirsizlik aralığı. Altyapı hazır, ürün değeri net.
3. **A1** — 1.754 satır ölü ajan/RAG kodunu karara bağla. Bakım borcu ve
   "sistemimiz var" yanılsaması üretiyor.
4. **V1/V2** — başlık kapsamını tamamla ve üretime taşı.

## 8. Bu planın DIŞINDA (gerekçeli)

- **Doğruluğu ±%20 50'ye çıkarmak.** Ölçüldü: veri bunu desteklemiyor.
  Hedef yeniden konmalı ya da problem yeniden tanımlanmalı.
- **LLM'in fiyat sayısını üretmesi/düzeltmesi.** Ölçülebilirliği yok eder.
- **Büyük ML hattı.** Basit hedonik model motoru geçemedi; büyüğüne geçmeden
  önce küçüğünün neden kaybettiği anlaşılmalı.
- **Yeni kullanıcı yüzeyi.** Yüzey dondurma sürüyor; M1 ve A3 mevcut
  yüzeylerin içeriğini düzeltir, yenisini eklemez.
