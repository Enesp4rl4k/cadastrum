# Sprint E — Sırada ne var

> 30 Ağustos 2026, P0–P2 deploy'undan sonra yazıldı.
> Önceki belgeler: `SPRINT-C-D-PLANI.md` (kapandı), Sprint A/B (kapandı).
>
> Bu plandaki bulguların hepsi **canlı üretim verisinden ölçüldü**, statik kod
> okumasından değil.

---

## Nerede kaldık

| | oturum başı | şimdi |
|---|---|---|
| Uzantı testi | 585 | 600 |
| Backend testi | 224 | 271 |
| Site testi | **0** | 22 |
| Site sayfası | 110 | 1.174 |
| Canlıda ölü endpoint | 2 | 0 |

Kapanan sınıf: "hata vermiyor ama içerik yok/yanlış". Kalan iş iki başlıkta
toplanıyor — **veri kalitesi** (aşağıda E.1–E.3) ve **kapanmamış test boşluğu**
(E.4–E.5).

---

## E.1 — Üretim verisinde HAYALET İLLER (yeni bulgu, canlı)

`/v1/fiyat/toplu-ozet?kategori=arsa` **83 il** döndürüyor. Türkiye'de 81 il var.

```
fazladan: "el zig"          ← Elâzığ'ın bozuk normalizasyonu
          "emlak endeksi"   ← parser sayfa etiketini il sanmış
```

**Kök neden — ölçüldü:** `normalizeYerAdi("Elâzığ")` doğru çalışıyor ("elazig").
Ama kaynak metinde â yerine bozuk karakter geldiğinde:

```
"El?zığ" → normalizeYerAdi → "el zig"     ← YENİ BİR İL doğuyor
```

Yani bir sayfa yanlış charset ile çözüldüğünde (ISO-8859-9 ↔ UTF-8), normalizasyon
bunu hata saymak yerine sessizce yeni bir yer adı üretiyor. `"emlak endeksi"` de
aynı kapının başka bir sonucu: parser bir sayfa etiketini il alanına yazmış.

**Asıl eksik:** ingest'te `il_norm` bilinen 81 ile karşı **hiç doğrulanmıyor**.

**Yapılacak**
- `IlanIngestSchema`'ya il doğrulaması: 81 il listesine karşı kontrol
  (liste zaten var — `src/lib/data/ilce-listesi-bootstrap.ts`, siteye üretilen
  `site/src/data/ilceler.ts` ile aynı kaynak).
- Bilinmeyen il → kayıt reddedilmez, **karantinaya** alınır (`il_norm` NULL +
  `hata_log`'a satır) — fiyat verisi sağlam, kaybetmenin anlamı yok; ama
  istatistiğe girmemeli.
- Mevcut iki hayalet ilin temizliği (D1 migration).
- `pipeline-health`'e kontrol: "il sayısı > 81" alarm.
- Test: bozuk karakterli girdi hayalet il üretmiyor.

## E.2 — "konut" kategorisi neredeyse tamamen AI baseline (yeni bulgu, canlı)

```
kategori   il   gerçek ilan kaynaklı   ai-baseline   "toplam ilan"
arsa       83   68                     15            20.539
tarla      81   71                     10            16.130
konut      81    3                     78            58.209   ← 37 gerçek ilan
```

Konutta yalnızca 3 ilde gerçek ilan var (Balıkesir 15, Sakarya 12, İstanbul 10 —
toplam **37 ilan**). Kalan 78 il AI baseline. Üstelik `ilan_adet` alanı AI
satırlarında **baseline satır sayısını** taşıyor (Adana 1.026, Adıyaman 650…),
yani "58.209 ilan" gerçek ilan sayısı değil.

Site konut fiyatı sunuyor ve bu sayıyı "ilan" diye gösteriyor — az önce
düzelttiğimiz "sabit veriyi canlı gibi sunma" sınıfının aynısı, farklı yerde.

**Yapılacak**
- `ilan_adet` ile `baseline_satir_sayisi` alanlarını AYIR; API ikisini birden
  döndürsün, site hangisini gösterdiğini söylesin.
- Konut için kaynak kararı: ya scraper'a konut kategorisi eklenir, ya da site
  konutu "AI tahmini" olarak açıkça etiketler. (Ölçüm: 37 ilan ile konut fiyat
  iddiası taşınamaz.)
- Test: `kaynak: "ai-baseline"` dönen bir yanıtta `ilan_adet` gerçek ilan
  sayısını iddia etmiyor.

## E.3 — Zaman serisi yalnızca 3 ay

`mahalle_zaman_serisi` 2026-06/07/08 tutuyor. Sonuçları:
- `/harita/trend` → 67/67 il "veri yetersiz" (artık dürüst, ama katman boş)
- `/harita/gelisen-bolgeler` → 81/81 il fiyat boyutu yok
- endeks → 3 nokta, tabanı zayıf (`baz_zayif: true`)

Bu üç özellik de **doğru davranıyor** ama gösterecek verileri yok. Dürüstlük
düzeltmesi yapıldı; sıradaki iş veriyi biriktirmek.

**Yapılacak**
- Aylık snapshot cron'unun gerçekten çalıştığını doğrula (seri neden 06'da
  başlıyor — o tarihte mi kuruldu, yoksa öncesi silindi mi?).
- Geçmişi geri doldurmak mümkün mü: `ilanlar.yakalanma_tarihi` üzerinden
  geçmiş aylar yeniden üretilebilir mi?
- `pipeline-health`: seri uzunluğu 6 ayın altındaysa uyar.

## E.4 — `content/` parser'ları hâlâ testsiz (~2.240 satır)

Sprint B backend'in en yük taşıyan parser'ını kapattı, bu oturum
`background/` payload kurucusunu kapattı. Kalan:

| dosya | satır | risk |
|---|---|---|
| `src/content/hepsiemlak.ts` | 874 | detay parser |
| `src/content/sahibinden.ts` | 835 | detay parser; kodda "CSS class obfuscate edilirse boş döner" itirafı var |
| `src/content/emlakjet.ts` | 531 | detay parser |
| `src/content/sahibinden-liste.ts` | 263 | liste parser |
| `src/content/hepsiemlak-liste.ts` | 182 | liste parser |

Bu dosyalar **verinin girdiği ilk kapı**. DOM değişince sessizce boş dönerler —
tam olarak bu oturumda dört kez düzelttiğimiz kalıp.

**Yapılacak:** her parser için gerçek sayfa fixture'ı + kabul ölçütü
"düzeltmeyi geri al, test kırılsın". Örnek: `test/ilan-payload.spec.ts`.

## E.5 — Site davranış testleri (yarım)

Bugün eklenen 22 test rota ve statik varlık sözleşmesini kapsıyor. Kapsanmayan:
- Sayfa render: 5 kritik sayfa hata vermeden çiziliyor mu
- Boş durum: API boş/hatalı yanıt verdiğinde anlamlı mesaj çıkıyor mu
- Endpoint sözleşmesi: `site/src` içindeki tüm `${API_BASE}/...` yolları
  backend route tablosuna karşı doğrulansın (bu oturumda bulunan
  `/fiyat/ilce/{il}` 404'ü bu testle bir daha üretime çıkmaz)

## E.6 — Küçük ama biriken borç

- **Workers saat tuzağı kuralı:** iki örnek düzeltildi ama kalıbı yasaklayan
  kontrol yok. `scripts/catch-disiplini.mjs` deseninde küçük bir tarayıcı:
  `backend/api/src` içinde modül seviyesinde `Date.now()` / `new Date()` yasak.
- **Ölü kod:** `src/lib/data/il-merkezleri.ts` (hiç import edilmiyor),
  `FirsatAvci.tsx` + `CanliFirsatAvcisi.tsx` (ikisi de `FirsatAvciPanel` ile
  değiştirilmiş), `MimariFizibiliteKarti.tsx` (motoru test edilmiş ama UI'a
  bağlı değil — özellik kullanıcıya ulaşmıyor).
- **`gercek-satis` hattı:** backend route yok, uzantı fonksiyonlarının çağıranı
  yok, Dexie tablosu write-only. Ya tamamlanmalı ya sökülmeli.
- **Deploy doğrulaması:** `--branch master` düzeltildi ama deploy sonrası
  "canlı gerçekten değişti mi" kontrolü elle. Küçük bir smoke script
  (birkaç URL + beklenen başlık) CI'dan sonra çalıştırılabilir.

---

## Doğrulama

```bash
npm run lint && npm run lint:catch && npm test
```

```bash
cd backend/api && npx tsc --noEmit && npm test
```

```bash
cd site && npm run check && npm run build && npm test
```

Deploy sonrası (bu oturumda öğrenildi — dal adı kritik):

```bash
cd site && npx wrangler pages deployment list --project-name cadastrum-site
```

`Environment` sütunu **Production** olmalı; `Preview` ise canlı site değişmemiştir.
