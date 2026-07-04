# Cadastrum — Veri Genişletme Yol Haritası

> Bu doküman: Cadastrum'un eksik veri katmanlarının audit'i + bunların hangi kaynaklardan doldurulacağı.
> "Kullanıcıyı dış kaynağa yönlendirme yok" — tüm veriler Cadastrum içinde sunulacak.

---

## Mevcut Durum (Audit)

| # | Veri | Durum | Kaynak |
|---|---|---|---|
| 1 | Parsel sınır + ada/parsel | ✅ Tam | TKGM API |
| 2 | İmar durumu (TAKS/KAKS/Emsal/Maks Kat) | ✅ Tam | e-Plan |
| 3 | Eğim & yükseklik & bakı yönü | ✅ Tam | Open-Meteo Elevation |
| 4 | OSM POI/yol mesafesi | ✅ Multi-radius (1/5/15 km) + fuel/trafo + Dexie cache | Overpass |
| 5 | Risk faktörleri (sit/askeri/zeytinlik/orman/mera) | ⚠️ Heuristic | Parsel nitelik + e-Plan metni regex |
| 6 | Emsal ilan fiyatları | ✅ Tam | Sahibinden + Hepsiemlak content scriptleri |
| 7 | TKGM satış yoğunluğu (heatmap) | ✅ Tam | TKGM analiz API |
| 8 | **Deprem risk skoru** | ✅ Koordinat bazlı (AFAD TDTH → il-tablo fallback) + PGA bantlı fiyat çarpanı | AFAD TDTH + IL_DEPREM |
| 9 | **İklim (yağış/sıcaklık/nem)** | ✅ Tam | Open-Meteo Archive |
| 10 | **Toprak tipi & organik madde** | ✅ Tam | ISRIC SoilGrids |
| 11 | **OSB/Sanayi koordinat** | ⚠️ OSM zayıf | — |
| 12 | **Havalimanı/liman koordinat** | ⚠️ OSM zayıf | — |
| 13 | **Nüfus yoğunluğu** | ❌ Eksik | — |
| 14 | **Sel/taşkın riski** | ❌ Eksik | — |
| 15 | **Heyelan duyarlılık** | ❌ Eksik | — |
| 16 | **Tapu gerçek satış fiyatı** | ❌ Kapalı | — |
| 17 | **KGM resmi yol haritası** | ⚠️ OSM | — |

---

## Genel Durum (Mayıs 2026)

Faz 1 → Faz 5 + Hijyen sprint serisi (S1-S4) ile ürün **pazara hazır** seviyede:
- Backend: Cloudflare Workers + D1 (20 tablo), 2 cron trigger (günlük + saatlik), tüm temel endpoint'ler canlı
- Site: 110 sayfa build, mobile drawer, KVKK consent, yeni Faz 4/5 sayfaları (sorgu, bildirimler, müşteriler, api-tokens, api-docs)
- Extension: KVKK consent modal, opt-in telemetri, DOM monitor (Sahibinden parser anomaly tespiti), bundle splitting (5MB→359KB), 119 test
- Bilinen eksikler S3.b/S4.b kapsamında: Onboarding, responsive, Dexie v12, dark mode, Sentry, OAuth — bunlar kalite katmanı

## Faz 1 — Bu Sprint (~12 saat, sıfır maliyet, geniş kapsam) — ✅ TAMAMLANDI

| Adım | Veri | Kaynak | Durum |
|---|---|---|---|
| 1 | Deprem risk skoru | AFAD TDTH (koordinat) → IL_DEPREM fallback | ✅ `src/lib/deprem-tdth.ts` |
| 2 | İklim (yağış/sıcaklık/nem yıllık ortalama) | Open-Meteo Archive | ✅ `src/lib/iklim.ts` |
| 3 | Toprak tipi & organik madde | ISRIC SoilGrids | ✅ `src/lib/toprak.ts` |
| 4 | OSM multi-radius (1/5/15 km) | Tek Overpass çağrısından bant sayımı | ✅ `MultiRadiusSayim` (osm.ts) |
| 5 | OSM tag genişletme | `amenity=fuel`, `power=substation\|tower` | ✅ osm.ts (`building=*` atlandı: hacim çok yüksek) |
| 6 | Fiyat motoru — PGA bantlı çarpan | `pgaCarpani(pga)` 6 bant (eski 5 zon → granüler) | ✅ `fiyat-tahmin.ts` |
| 7 | UI — Deprem (kaynak gösterimi) + Taşkın kartı | `DogalVeriKarti` | ✅ |
| 8 | Dexie cache (OSM 7g, Deprem 90g) | `db.ts` v9 → `osmCevreCache`, `depremRiskCache` | ✅ |

**Çıktı:** Mevcut veri katmanları görünür ve cache'li; deprem fiyat çarpanı il-zon yerine PGA bantlarında (daha granüler ve TDTH'a hazır); OSM POI bantları 1/5/15 km'de raporlanıyor.

---

## Faz 2 — Sonraki Sprint (~5 gün, statik dataset üretimi)

| Adım | Veri | Yöntem | Kapsam |
|---|---|---|---|
| 6 | OSB/Sanayi koordinatları | OSBÜK web → JSON dataset | 350+ OSB |
| 7 | Havalimanı koordinatları | DHMİ liste → manuel JSON | 56 havalimanı |
| 8 | Liman koordinatları | UDHB liste → manuel JSON | 30 liman |
| 9 | TÜİK nüfus | TÜİK CSV download → Cadastrum cache | Tüm mahalleler |

**Avantaj:** Donmuş statik veri, hiç dış API çağrısı yok, hızlı ve güvenilir.

---

## Faz 3 — Uzun Vade (resmi başvuru/anlaşma)

| Adım | Veri | Yol |
|---|---|---|
| 10 | DSİ taşkın haritası | DSİ Genel Müdürlüğü resmi veri talebi |
| 11 | AFAD ARAS heyelan | AFAD resmi başvuru |
| 12 | TKGM tapu satış fiyatı | TKGM kurumsal anlaşma + lisans |
| 13 | KGM resmi yol haritası | Karayolları açık veri portal talebi |

---

## Prensipler

1. **Cadastrum içinde çöz** — Kullanıcıyı dış kuruma "git şuraya bak" diye yönlendirme yok.
2. **Veri yetersiz ise dürüst ol** — Default 50km cezalandırması yok; veri yoksa skor null + nötr açıklama.
3. **Akıllı çıkarımlar** — Yapı yoğunluğu altyapı sinyali, vb. sağlam proxy'ler.
4. **Tüm veriler cache'li** — Dexie (extension) + KV (gelecek backend) ile zero-network repeat queries.
5. **Fiyat motoruna besle** — Her yeni veri katmanı, fiyat tahmini ve risk skoruna input olur.
