# Mahalle eşleşme hatalarını sıfıra yaklaştırma planı

## Hedef

Sahibinden/Hepsiemlak mahalle adı → TKGM `mahalleKodu` eşleşmesinde **otomatik başarı oranını maksimize** etmek; kalan vakaları **tek tık** manuel seçime indirmek.

Gerçek “%100” yalnızca TKGM’de kayıtlı olmayan semt/OSB isimleri için mümkün değil — bunlar manuel seçimle kapanır.

## Kök nedenler (özet)

| Katman | Sorun |
|--------|--------|
| Parse | Liste sayfasında 3 parçalı lokasyonda semt → mahalle sanılması |
| Parse | URL slug kullanılmıyor (detay sayfasında güvenilir kaynak) |
| Eşleşme | Tek geçişli fuzzy; alias / öğrenme yok |
| Eşleşme | Koordinat yedeği her ilanda yok |
| Veri | Sahibinden adı ≠ TKGM resmi adı |

## Fazlar (uygulanan)

### Faz 1 — Tek doğruluk kaynağı (parse)
- [x] `lokasyon-ayir.ts`: 3 parçalı lokasyonda mahalle **yalnızca Mh./Köyü suffix varsa**
- [x] Sahibinden + Hepsiemlak liste sayfaları aynı fonksiyonu kullanır
- [x] Sahibinden detay: breadcrumb yetersizse **URL slug** yedeği

### Faz 2 — Çözümleme hattı (resolve)
- [x] `mahalle-cozumle.ts` sıralı pipeline:
  1. Kullanıcı alias (IndexedDB, öğrenen)
  2. İsim eşleşmesi (token, fuzzy, skor ≥ 80)
  3. URL slug → liste eşleşmesi
  4. TKGM API (`findMahalleByAd`)
  5. Koordinat → poligon
  6. Aday önerileri + dropdown

### Faz 3 — Öğrenen sistem
- [x] `mahalleAlias` tablosu: `il|ilçe|mahalleNorm` → `mahalleKodu`
- [x] Başarılı otomatik eşleşme ve manuel seçimde kayıt
- [x] Yer düzelt + dropdown seçiminde kayıt

### Faz 4 — İzleme (sonraki sprint)
- [ ] Başarısız eşleşmeleri anonim log (opsiyonel backend)
- [ ] `scripts/mahalle-alias-uret.mjs` — TKGM listesi × OSM `mahalleler.json` ön eşleme
- [ ] Top 500 sık ilan mahallesi için gömülü seed

## Başarı metrikleri

- Detay sayfası + ada/parsel: **≥ %95** otomatik (alias + isim + URL + koord)
- Liste sayfası: mahalle null veya düşük güven — kullanıcı dropdown (beklenen)
- Aynı mahalle tekrar ilan: **%100** (alias)

## Kullanıcı akışı (hata kaldıysa)

1. Önerilen mahalleler dropdown’da (skor sıralı)
2. Tek seçim → alias kaydı → bir daha sormaz
3. “Yer yanlış mı?” ile il/ilçe düzeltme
