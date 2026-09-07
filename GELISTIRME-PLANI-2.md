# Geliştirme Planı 2 — Ölçüm Kapsamı

**Tarih:** 2026-09-07 · **Durum:** öneri, uygulanmadı
**Önceki plan:** `MIMARI-PLAN.md` (M1, A1, A2, A3 uygulandı)

---

## 0. Bu planın tezi

Önceki plan "doğruluk tükendi, belirsizliği yönet" diyordu ve bu **beş bağımsız
negatif ölçümle** desteklendi: kapsam büyütme, kalibrasyon, özellik ekleme,
model değişimi, hukuki kısıt. M1 ile aralık kalibre edildi (kapsama %17,7 →
%49,9), A2/A3 ile ajan katmanı bağlandı.

Ama o tezin altında sınanmamış bir varsayım var:

> **"Doğruluk tükendi" derken, ölçtüğümüz yerlerde tükendi.**

Bu planı yazarken üç şey ölçülmediğini fark ettim ve üçü de motorun en
iddialı olduğu yerler:

| boşluk | durum | neden ciddi |
|---|---|---|
| `spatial-radius` katmanı | backtest'te **hiç çalışmıyor** | Güven tavanı **98** — en yüksek. Bu sayı ölçüme değil sezgiye dayanıyor. |
| `konut` kategorisi | **hiç ölçülmüyor** | Motor konut tahmini üretiyor. Üretimde 127 ilan var; tahminler fiilen %100 statik tablodan. |
| Üretim katman dağılımı | **telemetri yok** | Hangi katmanın kaç kullanıcıya hizmet ettiğini bilmiyoruz. Backtest dağılımının üretimi temsil ettiği varsayılıyor. |

**Bu plan doğruluk artırmayı değil, ölçüm kapsamını genişletmeyi hedefliyor.**
Sonuç iki türlü olabilir ve ikisi de değerli: ya "buralarda da tükenmiş"
(tez güçlenir), ya da "burada kazanç var" (tez kısmen çürür ve yeni yön açılır).

---

## 1. Ö1 — `spatial-radius` katmanını ölç

### Sorun

`fiyat-tahmin.ts:211` bu katmanı kuruyor ama backtest'te asla devreye
girmiyor: yol backend API'ye çıkıyor (`/v1/emsal/spatial`) ve backtest
`fetch`'i kasten devre dışı bırakıyor (`vi.stubGlobal("fetch", …reject)`).

Sonuç: **motorun en güvenilir sayılan katmanının doğruluğu bilinmiyor.**
`guven-motoru.ts:57` ona 98 güven tavanı veriyor — `ilanGozlem-mahalle` ile
aynı. Ama `ilanGozlem-mahalle`'nin ±%20 isabeti ölçüldü (%29,7);
`spatial-radius`'unki ölçülmedi.

### Ek şüphe — ölçülmeden karar verilemez

Üretimde koordinatlı ilanların **%93'ü mahalle merkezi**, yalnızca %7'si
gerçek parsel (`data/faz3-koordinat-yigilma-olcum.json`). Spatial motor
"en yakın emsaller" derken büyük olasılıkla **aynı mahalle merkezindeki
ilanları** buluyor. Öyleyse `spatial-radius`, `ilanGozlem-mahalle`'nin pahalı
bir kopyası olabilir — ve ona daha yüksek güven vermek yanlış olur.

Aynı ölçümde tek noktada **442 ilan** yığılı olduğu görülmüştü; IDW p=2 ile
o noktaya yakın bir sorguda ağırlığın tamamına yakınını alıyorlar.

### Yapılacak

| # | iş | kabul ölçütü |
|---|---|---|
| Ö1.1 | Backtest'e spatial katmanı ekle — backend'e gitmeden, TRAIN kayıtlarından yerel bir spatial havuz kurarak | `baselineKaynak` kırılımında `spatial-radius` satırı görünür |
| Ö1.2 | `spatial-radius` vs `ilanGozlem-mahalle` **aynı kayıtlarda** kıyas | P5 ihlali yok: kovaya düşme sebebi tahminciye mal edilmiyor |
| Ö1.3 | Sonuca göre güven tavanını düzelt | 98 ölçümle doğrulanır ya da düşürülür |
| Ö1.4 | Yığılma etkisini ayrı ölç: `koord_kaynagi='parsel'` olan emsallerle sınırlı bir kol | Merkez koordinatının katkısı/zararı sayıyla belli |

**Risk:** Ö1.4 pozitif çıkarsa (merkez koordinatları zarar veriyorsa) spatial
sorguya `koord_kaynagi='parsel'` şartı eklemek gerekir; bu havuzun %93'ünü
düşürür. Karar ölçümden sonra verilir — daha önce ölçmeden yapılmadı ve doğru
karardı.

---

## 2. Ö2 — `konut` kategorisini ölç ya da kapat

### Sorun

Motor üç kategori destekliyor (`SEGMENT_INDEX`: arsa, konut, tarla) ama
backtest yalnızca ikisini ölçüyor. Konut için:

- Üretimde **127 aktif ilan** (arsa 16.070, tarla 18.379 ile kıyaslayın)
- Korpusta **0 konut ilanı** — tarayıcı bu kategoriyi hiç toplamıyor
- `mahalle_baseline_ai`'de **61.534 konut satırı** — tamamı `statik-baseline`
- Yani konut tahminleri fiilen **%100 ölçülmemiş statik tablodan** geliyor
- `guvenSkoruTavani` imzası `"arsa" | "tarla"` — konut için tavan **tanımsız**,
  varsayılan `arsa` uygulanıyor

Bir kullanıcı konut parseline baktığında bir sayı ve bir güven skoru görüyor.
İkisinin de dayanağı yok.

### Karar kuralı — ölçümden ÖNCE yazılıyor

1. Konut için hold-out kurulabiliyorsa (n ≥ 300) → **ölç**, sonucu yayınla,
   güven tavanını ölçüme bağla.
2. Kurulamıyorsa → **kategoriyi kapat.** Konut sorgusunda fiyat yerine
   "bu kategori için ölçülmüş veri yok" dönülür.

**S3 (olduğu gibi bırak) seçeneği yok.** Ölçülmemiş bir sayıyı ölçülmüş
gibi sunmak, bu projede tekrar tekrar ayıkladığımız şey.

### Ö2.1 zaten cevaplandı — plan yazılırken ölçüldü

**Korpusta konut ilanı: 0.** Tarayıcı yalnızca arsa ve tarla topluyor.
Üretimdeki 127 konut ilanı uzantı kullanıcılarından ve hepsi hold-out
kurmaya yetmeyecek kadar az.

Yani karar kuralının ikinci dalı işliyor: **n < 300 → kategoriyi kapat.**
Konut için hold-out kurulamıyor, dolayısıyla motor konutta ne kadar
yanıldığını asla söyleyemez.

| # | iş | kabul |
|---|---|---|
| ~~Ö2.1~~ | ~~Korpusta konut ilanı var mı~~ | **0 — ölçüldü** |
| Ö2.2 | Konut sorgusunda sayı yerine gerekçe dön | konut tahmini SAYI DÖNMÜYOR |
| Ö2.3 | `guvenSkoruTavani` imzasına konut ekle ve 0/kapalı yap | tavan tanımsız kalmıyor |
| Ö2.4 | Kararı `data/` altına yaz | gerekçe kalıcı |

**Alternatif — kapatmak yerine ölçülebilir hâle getirmek:** tarayıcıya konut
kategorisi eklemek (emlakjet `satilik-konut`). Bu, kategoriyi kurtarır ama
yeni bir tarama hattı demek ve arsa/tarla kapsamı hâlâ %4,5'te. Kapsam
büyütmenin doğruluğa katkısı ölçüldü ve düz çıktı; konutta farklı olacağının
garantisi yok. **Öneri: önce kapat, talep varsa ölçülebilir hâle getir.**

---

## 3. Ö3 — Üretim katman telemetrisi

### Sorun

Backtest'teki katman dağılımı (mahalle %62 / ilçe %35 / baseline %3)
**üretimi temsil ettiği varsayılıyor** ve bu varsayım hiç sınanmadı. Oysa iki
küme çok farklı olabilir:

- Backtest korpusu ilan **olan** mahallelerden örnekleniyor
- Üretimde kullanıcı **herhangi bir parsele** bakıyor — çoğu mahallede ilan yok
- Havuzlu mahalle oranı **%4,5** (2.928/65.718)

Yani üretimde `mahalle-baseline` katmanı çok daha sık çalışıyor olabilir — ki
o katmanın arsa bias'ı **+142** ve ±%20 isabeti %22,5.

Bunu bilmiyoruz. Ve M1'in kalibre aralığı yalnızca ölçülmüş katmanları
kapsıyor; üretimde ağırlık ölçülmemiş katmandaysa M1'in faydası da sanaldır.

### Yapılacak

| # | iş | gerekçe |
|---|---|---|
| Ö3.1 | `fiyat_tahmin_log` tablosu: kategori, baselineKaynak, guvenSkoru, adet — **fiyat ve konum YOK** | Gizlilik: hangi katmanın ne sıklıkta çalıştığını bilmek için parsel kimliği gerekmiyor |
| Ö3.2 | `pipeline-health`'e "katman dağılımı (son 7 gün)" kontrolü | Sapma görünür olur |
| Ö3.3 | Dağılım backtest'ten belirgin farklıysa backtest örneklemini yeniden düşün | Ölçüm gerçeği temsil etmeli |

**Yazma bütçesi:** günlük ~1.000 tahmin varsayımıyla 1.000 satır/gün — ücretsiz
katmanın 100k yazma bütçesinin %1'i. Sorun değil.

**Gizlilik ilkesi:** log satırında ne parsel kimliği, ne koordinat, ne fiyat
var. Cevaplanacak soru "hangi katman ne sıklıkta" ve bunun için bunların
hiçbiri gerekmiyor.

---

## 4. Ö4 — Kapsam: yarım kalan işleri bitir

| # | iş | durum | kabul |
|---|---|---|---|
| Ö4.1 | Başlık geriye doldurma | **koşuyor** (25/526) | korpus başlık ≥%60 |
| Ö4.2 | `korpus-uretime-guncelle.mjs --yaz` | Ö4.1'e bağlı | üretim başlık %6,5 → ≥%50 |
| Ö4.3 | Kalibrasyonu yenile (`backtest:real:yaz`) | Ö4.1'e bağlı | kapsama kapısı geçiyor |
| Ö4.4 | İmar zenginleştirmesi sürüyor mu — doğrula | saatlik cron | üretim imar %7,2 → ≥%20 |

**Ö4.3 kritik:** korpus büyüdükçe hata dağılımı kayar ve kalibrasyon eskir.
Kapsama kapısı bunu yakalar ama yenilemek elle bir iştir. Uzun vadede
`backtest:real:yaz`'ın CI'da periyodik koşması düşünülmeli.

---

## 5. Ö5 — Ajan/RAG: kaynak bekleyen işler

| # | iş | engel |
|---|---|---|
| Ö5.1 | Mevzuat KB 7 → ~40 madde | **Kaynak metin gerekiyor.** Kanun maddesi ezberden yazılmaz — uydurulmuş bir madde, uydurulmuş fiyattan zararlıdır; kullanıcı ona göre karar verir. |
| Ö5.2 | İkinci ajanı bağla (fırsat avcısı) | İlan fiyatı gerekiyor; motorun elinde yok. Uzantının ilan sayfası bağlamı açılmalı. |
| Ö5.3 | A4 LLM sentez | Ö5.1 tamamlanmadan değersiz — özetleyecek içerik yok. |

**Ö5.1 için gereken:** Resmî Gazete / mevzuat.gov.tr'den madde metinleri.
Toplanınca ben yapılandırırım; **atıf doğrulanmadan madde eklenmez.**

---

## 6. Sıra ve bağımlılık

```
Ö1 spatial ölçümü ──── bağımsız, EN YÜKSEK ÖNCELİK
                       (en yüksek güven verilen katman, hiç ölçülmemiş)

Ö2 konut ─────────────  bağımsız
                       (ölç ya da kapat — üçüncü seçenek yok)

Ö3 telemetri ─────────  bağımsız, ama Ö1/Ö2'nin sonucunu yorumlamayı kolaylaştırır

Ö4.1 başlık ──► Ö4.2 üretime taşı
            └─► Ö4.3 kalibrasyonu yenile

Ö5.1 mevzuat kaynağı ──► Ö5.3 LLM sentez
```

**Öneri sırası: Ö1 → Ö2 → Ö3 → Ö4 → Ö5.**

Ö1 ve Ö2 aynı sınıftan: motor bir sayı üretiyor ve o sayının doğruluğu
bilinmiyor. Bu projede en pahalıya mal olan hata sınıfı bu.

---

## 7. Bu planın DIŞINDA

- **Doğruluğu artırmayı yeniden denemek.** Beş negatif ölçüm var. Ö1/Ö2'den
  yeni bir sinyal çıkmazsa bu kapı kapalı kalır.
- **Yeni kullanıcı yüzeyi.** Yüzey dondurma sürüyor.
- **LLM'in fiyat üretmesi.** Ölçülebilirliği yok eder (MIMARI-PLAN §4.2).
- **Ö1.4 sonucuna göre spatial havuzu daraltmak** — ölçüm önce, karar sonra.

---

## 8. Kabul: bu plan ne zaman başarılı sayılır

1. `spatial-radius` ve `konut` için ±%20 / bias / n sayıları `data/` altında.
2. Güven tavanları ölçüme dayalı; dayanmayan kategori **kapalı**.
3. Üretim katman dağılımı biliniyor ve backtest'ten sapması ölçülü.
4. Korpus başlık ≥%60, üretim başlık ≥%50, kalibrasyon güncel.
5. Ölçüm sonucu negatifse `data/*-negatif-sonuc.json` olarak yazılmış (P3).
