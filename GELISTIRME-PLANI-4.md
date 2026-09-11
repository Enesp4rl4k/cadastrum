# Geliştirme Planı 4 — Doğrula, bütçeyi düzelt, veri hattını koru

**Tarih:** 2026-09-11 · **Durum:** öneri, uygulanmadı
**Önceki:** `GELISTIRME-PLANI-3.md` (G1–G4 uygulandı, G5–G6 açık)

---

## 0. Neredeyiz

Plan 3'ün tezi "doğruluk tarafında iş kalmadı, ölçüm ve işletim hattı
güvenilmez" idi. Uygulama bunu fazlasıyla doğruladı: bu turda bulunan
hataların neredeyse hepsi **var görünen ama ölçmeyen kontrol** sınıfındandı.

| bulundu | durum |
|---|---|
| Konut backtest'i türetilmiş tabloyu kendisiyle ölçüyordu (±%20 = 66,4) | kapıdan çıkarıldı, P8–P12 kodla zorlanıyor |
| Okuma bütçesi alarmı hiç yazılmayan tabloyu okuyordu | sayaç kuruldu, "bilinmiyor" durumu eklendi |
| Sayaç `first()` ve başarısız sorguları görmüyordu | ikisi de sayılıyor |
| Smoke test canlı 500'ü "başarılı" sayıyordu | assert |
| Gerçek satış tablosu üretimde yoktu; 500 TL/m² tabanı tarlanın %36'sını atıyordu | düzeltildi, canlı |
| Mesken 2,5× ölçülmemişti; `bağ\b` bağları arsa sayıyordu; `İ` eşleşmiyordu | düzeltildi |
| Konut sayıları türetilmiş/kaynaksız | kapatıldı (endeks bilinçli açık) |
| Sunucu hataları D1 çökünce kayboluyordu | KV yedeği |
| Ücretli sağlayıcılara dayanaksız atıflar, biri kullanıcıya "metodoloji" | düzeltildi |

**Bu planın tezi:** artık ölçüm aletleri güvenilir; ilk kez **gerçek
tüketimi, gerçek hata dağılımını, gerçek kesintiyi** görebileceğiz. Plan 4 o
veriyi toplamak ve ona göre düzeltmekle başlıyor. Tahmin yok — ölçüm önce.

**Kısıt, dürüstçe:** üretimde günde ~4 kullanıcı sorgusu var. Gerçek satış
döngüsü (G3) ve katman telemetrisi (Ö3) kullanıcı olmadan dolmaz. Planın
sonunda bunu açıkça ele alıyorum.

---

## H1 — Yarın doğrula (00:00 UTC sıfırlamasından sonra) · 1 gün

Bugün D1 okuma limiti doluydu ve yeni aletler hiç normal bir günü görmedi.

| # | kontrol | kabul |
|---|---|---|
| H1.1 | `okuma_butcesi_gunluk` 03:00 günlük + saatlik cron satırları | `cron-gunluk` ve `cron-saatlik` satırları var, `hata_adet` ≈ 0 |
| H1.2 | **Sayacın kapsamı** — Σ `satir_okuma` ÷ `wrangler d1 info` `rows_read_24h` | **≥ %80**; altındaysa sayaç tüketimin önemli kısmını görmüyor |
| H1.3 | Zenginleştirme günlüğü | 10:00'dan beri eksik olan saatlik satırlar geri geliyor; `gecici_dagilim` dolu |
| H1.4 | 11 Eylül cron kesintisinin sebebi | H1.1 satır yazıyorsa sebep D1 limitiydi (yerel test bunu destekliyordu); yazmıyorsa soru yeniden açılır |

**Bu fazdan önce hiçbir bütçe düzeltmesi yapılmaz** — tüketiciyi bilmeden
düzeltmek tahmindir (P1).

---

## H2 — Okuma bütçesini düzelt · H1'e bağlı

Ölçülen: `rows_read_24h` 6,5M, yalnızca ~1.300 sorgudan → sorgu başına ~5.000
satır. Tam taramalar. Limit üç kez doldu (4, 9, 11 Eylül); her seferinde
fiyat uçları 500 döndü.

| # | iş | kabul |
|---|---|---|
| H2.1 | H1 kırılımından en büyük iki tüketiciyi seç | adıyla, sayısıyla `data/` altında |
| H2.2 | Her biri için: indeks / önden hesaplanmış tablo / sıklık azaltma — ölçümle seç | tüketici başına okuma **en az yarıya** iner |
| H2.3 | Günlük toplam | **< 2,5M** (limitin %50'si) — 7 gün üst üste |

Bilinen aday: `pipeline-health` ~5 tam tarama × 67k ≈ 340k/gün (%7).
Tek başına açıklamıyor; asıl tüketici H1'le belli olacak.

**Ücretli D1'e geçiş bu planın dışında** — önce israf ölçülüp giderilir.

---

## H3 — Veri hattını koru · bağımsız, hemen başlanabilir

### H3.1 Aylık iş akışı zenginleştirilmiş korpusu eziyor — ÖNCELİKLİ

`.github/workflows/aylik-emlakjet.yml` her ayın 1'inde korpusu **yeniden
yazıyor**. Bu turda görüldü: 1 Eylül'deki otomatik commit korpusu **33.445**
ilana indirmişti, yereldeki güncel korpus **66.621** ilan ve başlık kolonu
taşıyor. Birleştirmede yerel sürüm korundu — ama 1 Ekim'de iş aynı şeyi
tekrar yapacak ve korpus yarıya inecek. Ayrıştırıcı bütünlük kapısı kaybı
yakalar ama **bozulmayı önlemez**.

| iş | kabul |
|---|---|
| İş akışı korpusu **birleştirsin** (yeni ilanları ekle, mevcutları güncelle), üzerine yazmasın | iş akışı sonrası ilan sayısı **azalmıyor**; azalırsa iş BAŞARISIZ |
| Başlık/koordinat gibi zenginleştirilmiş kolonlar korunur | kolon doluluk oranı düşmüyor |

### H3.2 Zenginleştirmede %75 geçici hata

Artık kod bazında kaydediliyor (`gecici_dagilim`). 3 gün veri sonra:
- çoğunluk **429** → istekler arası bekleme artırılır, parti küçültülür
- çoğunluk **403** → kaynak Worker IP'lerini engelliyor; zenginleştirme yerel gecelik koşuya taşınır
- çoğunluk **0** (timeout) → zaman aşımı/eşzamanlılık ayarı

Karar dağılıma bakılarak verilir, önceden değil. Kabul: başarı oranı
%25 → **≥ %60** ya da sebebin kaynak taraflı olduğu kanıtla yazılır.

### H3.3 Push disiplini

Bu turda **83 commit** hiç push edilmemişti; site ancak push ile deploy
edilebildi (yerel ağ Cloudflare'e paralel yüklemeyi kesiyor). Kural: her
faz sonunda push. CI (`ci.yml`) push'ta koşuyor — kırmızıysa deploy yok.

---

## H4 — Ölçüm kapsamı · bağımsız

### H4.1 Backtest nitelik çarpanlarının 2'sini ölçüyor — 7+6'yı ölç

Backtest parselleri yalnızca "Tarla"/"Arsa" taşıyor. Bahçe/Bağ/Zeytinlik ve
tarla dalındaki geçersiz kılmalar (Zeytinlik 1,4 · Bahçe 1,3 · Bağ 1,1) **hiç
çalışmıyor**. Başlıktan türetilmiş sinyal:

| | motor | ölçülen (aynı mahalle, tarlaya oran) | mahalle n |
|---|---|---|---|
| zeytinlik | 1,4 | 0,94 | 319 |
| bahçe | 1,3 | 1,64 | 748 |
| bağ | 1,1 | 1,47 | 48 |

Yapılacak: başlıktan nitelik türetip backtest'e **ayrı bir kol** olarak
eklemek (kontrol kolu değişmeden — daha önce denenen varyant kontrol kolunu
bozmuştu, `segment-duzeltme-negatif-sonuc.json` d). Karar kuralı önceden:
kol ±%20'yi ≥ 1 puan artırıyorsa çarpan ölçüme bağlanır; artırmıyorsa
çarpanlar olduğu gibi kalır ve negatif sonuç yazılır.

### H4.2 G5 — SLO'yu medyan sapmaya taşı (Plan 3'ten)

- Hold-out tohumu değiştirilerek **5 koşum**, medyan sapmanın oynaklığı
- Eşik bu oynaklığa göre konur, tek koşuma göre değil
- Ortalama bias silinmez, "uç kayıt göstergesi" olarak kalır

---

## H5 — Kod sağlığı · bağımsız, küçük

| # | iş | neden |
|---|---|---|
| H5.1 | "Tarımsal mı?" kopyalarını tek fonksiyona topla | 5 kopya farklı sözcük listesi taşıyor (mera, orman, çayır); aynı parsel kartlarda farklı sınıflanabilir. `bağ\b` düzeltmesi yalnızca bozuk parçayı değiştirdi — anlam farkları bilinçli olarak korundu, ölçülerek birleştirilmeli |
| H5.2 | İki ayrı `FiyatTahmini` arayüzü | `lib/fiyat/types.ts` ve `lib/fiyat-tahmin.ts` — biri `uygulananIndirim` taşıyor, diğeri taşımıyor; ayrışma riski |
| H5.3 | Nitelik'siz parsel geçiren yolu bul | `nitelikCarpani(undefined)` düzeltildi ama hangi yolun `undefined` geçirdiği tespit edilmedi |
| H5.4 | KV'deki hata yedeğini okuyan sağlık kontrolü | yedek yazılıyor ama henüz kimse okumuyor — P2 |
| H5.5 | "Ev" mesken deseninde yok; "Bilinmeyen nitelik 0,5" ölçülmemiş | "Kargir Ev" 0,5 · "Kargir Bina" 1,0 |

---

## H6 — Kullanıcı: ölçüm döngülerinin yakıtı · karar gerektiriyor

**Bu planın en önemli ve en az teknik maddesi.** Üretimde günde ~4 sorgu
var. Kurduğumuz ölçüm döngülerinin ikisi kullanıcıyla dolar:

- **G3 gerçek satış** — karar kuralı n ≥ 200 istiyor; bugün n = 0
- **Ö3 katman telemetrisi** — dağılım için n ≥ 1.000 sorgu gerekiyor

Bunlar kullanıcı gelmeden hiçbir şey söylemeyecek. Motoru daha fazla
iyileştirmenin sınırına geldik (yedi negatif ölçüm); bir sonraki gerçek bilgi
kaynağı kullanıcı.

| # | iş | not |
|---|---|---|
| H6.1 | Kalibrasyon tablosunu tazele (`backtest:real:yaz`) | Plan 3 G6.1 |
| H6.2 | Uzantıyı Chrome Web Store'a yayınla | **yeni yüzey değil** — mevcut ürünün dağıtımı; karar senin |
| H6.3 | Smoke test'i CI'a bağla | artık 500'ü kırmızı sayıyor |

---

## Sıra

```
H3.1 aylık iş akışı ──── HEMEN (1 Ekim'de korpus yarıya iner)
H1   yarın doğrula ───── 12 Eylül 03:00 UTC sonrası
H2   bütçe ────────────── H1'e bağlı
H3.2 zenginleştirme ─── 3 günlük dağılım verisine bağlı
H4, H5 ───────────────── bağımsız, H1–H2 beklerken
H6   kullanıcı ────────── senin kararın; teknik olarak hazır
```

## Bu planın DIŞINDA

1. **Doğruluğu doğrudan artırma denemesi.** Yedi negatif ölçüm var; H4.1 yeni
   sinyal verirse açılır.
2. **Ücretli D1.** Önce israf.
3. **Konut için tarama hattı.** Kapatıldı; talep gelirse açılır.
4. **LLM'in fiyat üretmesi.** Ölçülebilirliği yok eder.

## Kabul

1. Sayaç kapsamı ≥ %80, bütçe tüketicisi adıyla biliniyor.
2. Günlük okuma 7 gün üst üste < 2,5M; fiyat uçlarında limit kaynaklı 500 yok.
3. Aylık iş akışı korpusu küçültemiyor — kapıyla korunuyor.
4. Zenginleştirme geçici hatasının sebebi dağılımla biliniyor.
5. Nitelik çarpanları ya ölçülmüş ya "ölçülmedi" diye işaretli.
6. Negatif sonuçlar `data/` altında (P3).
