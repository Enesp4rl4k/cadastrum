# Cadastrum — Yol Haritası v3

> **Son güncelleme:** 24 Temmuz 2026  
> **Durum:** Faz A–C + Veri Faz 2 tamamlandı. Sırada: büyüme + gelir + moat.

---

## Mevcut Ürün (Tamamlanan)

### Temel Altyapı ✅
- Chrome Extension (sidepanel) — TKGM parsel sorgu, e-Plan imar, risk analizi
- Backend: Cloudflare Workers + D1 + R2 — `cadastrum-api.cadastrum-tr.workers.dev`
- Ödeme: LemonSqueezy (Tier 0 Free / Bireysel Pro $9 / Kurumsal $29+)
- Auth: JWT + email OTP (Resend)

### AI Özellikleri ✅
| Özellik | Durum | Dosya |
|---|---|---|
| AI Gelecek Değer Skoru | ✅ | `GelecekDegerKarti.tsx` |
| AI Arazi Avcısı | ✅ | `AraziAvciKarti.tsx` + `/arazi-avci` |
| **Agentic Fırsat Tarayıcı** | ✅ | `AjanFirsatTarayici.tsx` + `/agent` |
| **Açıklanabilir AI Değerleme** | ✅ | `FiyatAciklamasi.tsx` + `/ai-fiyat/acikla` |
| AI Yatırım Danışmanı Chat | ✅ | `AIDanismanKarti.tsx` + `/ai-danisman` |
| AI Scorecard (5 boyut) | ✅ | `ScorecardKarti.tsx` + `/ai-scorecard` |
| İmar Değişikliği Tahmini | ✅ | `ImarDegisimSinyalKarti.tsx` |
| Trend Grafikleri | ✅ | `TrendGrafik.tsx` |

### Görselleştirme ✅
| Özellik | Durum | Dosya |
|---|---|---|
| Dijital İkiz 2.5D (SVG izometrik) | ✅ | `DijitalIkizKarti.tsx` |
| **Dijital İkiz 3D (Deck.gl WebGL)** | ✅ | `DijitalIkiz3D.tsx` |
| Uydu Gelişim Trendi | ✅ | `HavaFotoTimeline.tsx` + `GelisimTrendiKarti.tsx` |
| Spatial Heatmap | ✅ | `SpatialHeatmapMini.tsx` |

### Veri Katmanı ✅
| Veri | Durum | Kaynak |
|---|---|---|
| Parsel sınır + TKGM | ✅ | TKGM API |
| İmar (TAKS/KAKS/Emsal/Kat) | ✅ | e-Plan |
| Emsal ilan fiyatları | ✅ | Sahibinden + Hepsiemlak + Emlakjet (günlük 15 ilçe rotasyon) |
| Eğim + yükseklik + bakı | ✅ | Open-Meteo Elevation |
| OSM POI/yol mesafesi | ✅ | Overpass API (multi-radius) |
| Deprem riski | ✅ | AFAD TDTH + PGA bantlı çarpan |
| Sel/taşkın riski | ✅ | Il bazlı + koordinat bazlı GloFAS |
| OSB koordinatları | ✅ | osblar.ts — 280+ OSB |
| Havalimanı koordinatları | ✅ | havalimanları.ts — 56 havalimanı |
| Liman koordinatları | ✅ | limanlar.ts — 41 liman |
| Nüfus yoğunluğu | ✅ | il-nufus.ts (TÜİK bazlı) |
| Serbest bölge + lojistik park | ✅ | serbest-bolgeler.ts — 35 nokta |
| Otoyol ağı (spatial grid) | ✅ | otoyollar.ts |
| TMO/lisanslı depo | ✅ | lisansli-depolar.ts — 130+ nokta |
| Milli Emlak ihalesi | ✅ | milli-emlak.ts |
| İklim verileri | ✅ | Open-Meteo Archive |
| Toprak tipi | ✅ | ISRIC SoilGrids |
| TUCBS ÇDP katmanı | ✅ | tucbs.ts + R2 tile cache |
| TKGM satış heatmap | ✅ | TKGM analiz API |

---

## Sıradaki Sprint Listesi

### Sprint 1 — Büyüme: Kullanıcı Edinimi (2–3 hafta)

**Hedef:** İlk 500 aktif kullanıcı → veri flywheel'i başlat.

| # | İş | Etki | Süre |
|---|---|---|---|
| G1 | Chrome Store listing optimize — screenshot + açıklama güncellemesi | 🔴 Yüksek | 1 gün |
| G2 | Onboarding flow iyileştirme — ilk açılışta değer göster (demo parsel) | 🔴 Yüksek | 2 gün |
| G3 | Referral sistemi — "Arkadaşını davet et, 1 ay Pro kazan" | 🟡 Orta | 3 gün |
| G4 | Extension popup'tan site'e UTM link | 🟡 Orta | 0.5 gün |

### Sprint 2 — Gelir: Conversion Optimizasyonu (2 hafta)

**Hedef:** Free → Pro conversion %2'den %5'e çıkar.

| # | İş | Etki | Süre |
|---|---|---|---|
| R1 | Paywall tetikleyici iyileştir — "Bu özelliği dene" CTA | 🔴 Yüksek | 1 gün |
| R2 | 7 günlük deneme hatırlatma email dizisi (Resend) | 🔴 Yüksek | 2 gün |
| R3 | Fiyat sayfası A/B — yıllık ön plan ($85 vs $99) | 🟡 Orta | 1 gün |
| R4 | Kurumsal lead form — "Ekibiniz için demo" | 🟡 Orta | 1 gün |

### Sprint 3 — Ürün: Moat Genişletme (3–4 hafta)

**Hedef:** Rakiplerin kopyalayamayacağı özellikler.

| # | İş | Etki | Süre | Açıklama |
|---|---|---|---|---|
| M1 | Portföy izleme dashboard | 🔴 Yüksek | 1 hafta | Çoklu parsel + delta takip + alert |
| M2 | Karşılaştırmalı analiz (4 parsel yan yana) | 🟡 Orta | 3 gün | KarsilastirmaPanel.tsx genişletme |
| M3 | PDF rapor kalitesi — Pro branding + 15-20 sayfa | 🔴 Yüksek | 1 hafta | rapor.ts güncelleme |
| M4 | Mobil uyumlu web app (`/sorgu` geliştirme) | 🟡 Orta | 1 hafta | site/astro genişletme |

### Sprint 4 — Veri: Kapsama Artırma (sürekli)

**Hedef:** 973 ilçenin %80'ini gerçek ilan verisiyle kapsa.

| # | İş | Etki | Süre | Açıklama |
|---|---|---|---|---|
| D1 | Emlakjet günlük cron izleme dashboard | 🔴 Yüksek | 1 gün | Admin panel'e ekleme |
| D2 | Hepsiemlak aylık scraper otomasyonu | 🔴 Yüksek | 2 gün | aylik-scrape-hepsiemlak.mjs → cron |
| D3 | Extension veri katkısı gamification | 🟡 Orta | 3 gün | "Bu sayfada 47 ilan eklendi" + katkı skoru |
| D4 | Sahibinden liste scraper otomasyonu | 🟡 Orta | 3 gün | sahibinden-liste.ts Worker entegrasyonu |

### Sprint 5 — Kurumsal: B2B Geliştirme (4–6 hafta)

**Hedef:** İlk 5 kurumsal müşteri ($145/ay+).

| # | İş | Etki | Süre | Açıklama |
|---|---|---|---|---|
| B1 | API token sistemi production'a al | 🔴 Yüksek | 2 gün | public-api.ts zaten var, UI gerekiyor |
| B2 | Toplu parsel analizi (CSV import) | 🟡 Orta | 1 hafta | 10-100 parsel batch |
| B3 | White-label rapor (logo upload) | 🟡 Orta | 3 gün | rapor.ts + storage |
| B4 | Kurumsal onboarding akışı | 🟡 Orta | 2 gün | Admin panel'den kullanıcı yönetimi |

---

## Veri Faz 3 — Resmi Başvuru Gerektiren (uzun vade)

| Veri | Yol | Öncelik |
|---|---|---|
| DSİ taşkın haritası (1/1000 ölçek) | DSİ Genel Müdürlüğü resmi veri talebi | 🟡 Orta |
| AFAD ARAS heyelan haritası | AFAD resmi başvuru | 🟡 Orta |
| TKGM tapu satış gerçek fiyatı | TKGM kurumsal anlaşma + lisans | 🔴 Yüksek (moat) |
| KGM resmi yol haritası | Karayolları açık veri portal | 🟢 Düşük |
| Emlakjet resmi data API | Partnership anlaşması (~$200-500/ay) | 🟡 Orta |

---

## Öncelik Matrisi

```
Etki / Çaba:     Düşük Çaba    Orta Çaba    Yüksek Çaba
Yüksek Etki:     G1, G2        M1, M3       D2, D4, B2
Orta Etki:       R1, D1        G3, R2, B1   B3, M2
Düşük Etki:      G4            R3, R4        M4
```

**İlk odak (bu hafta):** G1 → G2 → R1 → D1

---

## KPI Hedefleri (2026 Q3–Q4)

| Metrik | Şimdi | Q3 Hedef | Q4 Hedef |
|---|---|---|---|
| Aktif kullanıcı | — | 500 | 2.000 |
| Pro subscriber | — | 50 | 200 |
| Aylık gelir (MRR) | $0 | $450 | $1.800 |
| İlçe kapsama (ilan verisi) | ~200 | 400 | 700 |
| Chrome Store puanı | — | 4.5+ | 4.7+ |

---

## Teknik Borç & Temizlik

| # | İş | Öncelik |
|---|---|---|
| T1 | `any` tipler → strict TypeScript | 🟢 Düşük |
| T2 | Test coverage artırma (kritik lib) | 🟡 Orta |
| T3 | Bundle boyutu analizi (`@next/bundle-analyzer`) | 🟡 Orta |
| T4 | Cloudflare Workers CPU time profiling | 🟡 Orta |
| T5 | D1 index optimizasyonu (mahalle_istatistik) | 🟡 Orta |

---

## Ürün İlkeleri

1. **Açıklanabilir skor** — kara kutu yok; her puanın faktörü UI'da sayısal gerekçeyle
2. **Tavsiye değil** — gelecek değer, imar tahmini ve chat metinlerinde yasal disclaimer
3. **Önce mevcut veri** — yeni özellik önce D1/e-Plan/uydu/trend'i tüketir; yeni API son çare
4. **Server-side prompt** — AI prompt'ları client'tan gelmez, server-side oluşturulur
5. **Tier** — Temel analiz ücretsiz teaser; AI + 3D + sınırsız chat → Pro/Pro+
6. **Cadastrum içinde çöz** — kullanıcıyı dış kuruma "git şuraya bak" diye yönlendirme yok
