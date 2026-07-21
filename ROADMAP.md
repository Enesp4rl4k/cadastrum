# Cadastrum — Yol Haritası

> İki katman: (1) **ürün / AI özellikleri**, (2) **veri genişletme**.  
> Prensip: kullanıcıyı dış kaynağa yönlendirme yok — tüm değer Cadastrum içinde.

**Son güncelleme:** 21 Temmuz 2026

---

## Ürün / AI Yol Haritası

Öncelik sırası: önce skor ve keşif (gelir + fark), sonra grafik/chat (engagement), en sonda tahmin ve dijital ikiz (moat).

| # | Özellik | Kısa tanım | Hedef yüzey | Durum |
|---|---|---|---|---|
| P1 | **AI gelecek değer skoru** | 3–5–10 yıl değer / getiri bandı (açıklanabilir bileşenler) | eklenti + `/sorgu` + rapor | ✅ |
| P2 | **AI arazi avcısı** | Kriter → Türkiye genelinde aday parsel/bölge listesi | site + eklenti bildirim | ✅ |
| P3 | **Arsa trend grafikleri** | Mahalle / ilçe TL/m² zaman serisi (SVG line chart) | site `/sorgu`, eklenti | ✅ |
| P4 | **AI yatırım danışmanı chat** | Parsel bağlamlı RAG sohbet (imar, fiyat, risk, fizibilite) | site + eklenti panel | ✅ |
| P5 | **İmar değişikliği tahmini** | Plan değişikliği / emsal yükseliş olasılık sinyali | eklenti + rapor | ✅ |
| P6 | **Arsa dijital ikizi** | 2.5D: parsel poligon + imar zarfı (TAKS/KAKS/kat) + eğim + POI | eklenti + Pro rapor | ✅ |

---

### Faz A — Skor & keşif (P1–P2) ✅ TAMAMLANDI

| Adım | Ne | Kanıt |
|---|---|---|
| A1 | AI gelecek değer skoru v0 | `src/lib/gelecek-deger-skoru.ts`, `GelecekDegerKarti.tsx` |
| A2 | Bileşen kırılımı UI | `GelecekDegerKarti.tsx` — 3/5/10y band + faktör listesi |
| A3 | AI arazi avcısı v0 | `routes/arazi-avci.ts`, `AraziAvciKarti.tsx`, `db/0021_arazi_avci.sql` |
| A4 | Avcı uyarıları | `POST /v1/arazi-avci/kriter` + `PATCH .../uyari` — bildirim kuralı entegrasyonu |

---

### Faz B — Grafik & danışman (P3–P4) ✅ TAMAMLANDI

| Adım | Ne | Kanıt |
|---|---|---|
| B1 | SVG trend grafiği | `TrendGrafik.tsx` — SVG line chart, 6/12/24 ay seçeneği |
| B2 | Grafik veri API | `GET /v1/sorgu/trend` — interval, kaynak etiketi, değişim yüzdesi |
| B3 | AI danışman chat v0 | `routes/ai-danisman.ts`, `AIDanismanKarti.tsx` — Gemini 2.5 + Groq fallback |
| B4 | Chat guardrails | Server-side sistem promptu, yatırım tavsiyesi reddi, kaynak zorunluluğu |

---

### Faz C — Tahmin & dijital ikiz (P5–P6) ✅ TAMAMLANDI

| Adım | Ne | Kanıt |
|---|---|---|
| C1 | İmar değişikliği sinyal v0 | `src/lib/imar-degisim-sinyal.ts`, `backend/api/src/lib/imar-degisim-sinyal.ts` |
| C2 | Olasılık bandı UI | `ImarDegisimSinyalKarti.tsx` — düşük/orta/yüksek + gerekçe + bileşen çubukları |
| C3 | Dijital ikiz v0 | `DijitalIkizKarti.tsx` — izometrik SVG, TAKS/KAKS/kat zarfı + POI özeti |
| C4 | Dijital ikiz v1 | İzometrik projeksiyon + eğim + bakı yönü + yakın POI gösterimi |

---

### Tamamlanan ilgili temel

| Özellik | Durum | Kanıt |
|---|---|---|
| Yatırım skoru (açıklanabilir) | ✅ | `lib/yatirim-skoru.ts`, `YatirimSkoruKarti.tsx` |
| Gelecek değer skoru | ✅ | `lib/gelecek-deger-skoru.ts`, `GelecekDegerKarti.tsx` |
| Uydu gelişim trendi (Wayback) | ✅ | `HavaFotoTimeline.tsx`, `GelisimTrendiKarti.tsx`, `/v1/proxy/wayback` |
| Fiyat trend API | ✅ | `routes/sorgu.ts` `GET /trend`, `FiyatTrendiKarti.tsx` |
| Fizibilite / kat karşılığı | ✅ | `Fizibilite.tsx`, `kat-karsiligi.astro` |
| Spatial emsal + bildirim kuralları | ✅ | `routes/emsal-spatial.ts`, `BildirimKurali.tsx` |
| AI Scorecard (5 boyut) | ✅ | `routes/ai-scorecard.ts`, `ScorecardKarti.tsx`, `db/0018_ai_scorecard_cache.sql` |
| AI Fiyat proxy | ✅ | `routes/ai-fiyat.ts` |
| AI Danışman chat | ✅ | `routes/ai-danisman.ts`, `AIDanismanKarti.tsx`, `db/0022_ai_sohbet.sql` |
| AI Arazi Avcısı | ✅ | `routes/arazi-avci.ts`, `AraziAvciKarti.tsx`, `db/0021_arazi_avci.sql` |
| İmar Değişim Sinyali | ✅ | `lib/imar-degisim-sinyal.ts`, `ImarDegisimSinyalKarti.tsx`, `routes/imar-degisim.ts` |
| Dijital İkiz (2.5D) | ✅ | `DijitalIkizKarti.tsx` |
| Trend Grafiği (SVG) | ✅ | `TrendGrafik.tsx` |
| Emlakjet scraper (81 il) | ✅ | `lib/emlakjet-scraper.ts` |
| Sahibinden scraper | ✅ | `lib/sahibinden-scraper.ts` |
| Milli Emlak entegrasyonu | ✅ | `routes/milli-emlak.ts`, `db/0019_milli_emlak.sql` |
| TCMB döviz kuru | ✅ | `routes/tcmb.ts` |
| Admin panel | ✅ | `routes/admin.ts` |
| CRM sistemi | ✅ | `routes/crm.ts`, `musteri.astro` |
| Abonelik & ödeme (Lemon Squeezy) | ✅ | `routes/lemon.ts`, `AbonelikYonetimi.tsx` |
| API Token sistemi | ✅ | `db/0012_api_tokens.sql`, `routes/public-api.ts` |
| Rapor export | ✅ | `routes/rapor.ts`, `RaporExportButonu.tsx` |
| Al/Sat karar motoru | ✅ | `AlSatKararMotoru.tsx` |
| İhale alarm kartı | ✅ | `IhaleAlarmKarti.tsx` |
| Kayıtlı taramalar | ✅ | `KayitliTaramalar.tsx` |
| Parsel not defteri | ✅ | `ParselNotDefteri.tsx` |
| Zaman makinesi modal | ✅ | `ZamanMakinesiModal.tsx` |
| Komut paleti (Cmd+K) | ✅ | `KomutPaleti.tsx` |
| Onboarding akışı | ✅ | `Onboarding.tsx` |
| Paywall / kilit sistemi | ✅ | `PaywallKilit.tsx` |
| Tema seçici (dark/light) | ✅ | `TemaSecici.tsx` |

### Test kapsamı

| Test dosyası | Kapsam | Durum |
|---|---|---|
| `test/gelecek-deger-skoru.spec.ts` | Unit — 33 test | ✅ 33/33 passed |
| `test/imar-degisim.spec.ts` | Unit — 15 test | ✅ 15/15 passed |
| `backend/api/test/arazi-avci.spec.ts` | Integration — `/v1/arazi-avci/ara` + `/kriter` | ✅ |
| `backend/api/test/ai-danisman.spec.ts` | Integration — `/v1/ai-danisman/sohbet` + `/imar-degisim/sinyal` | ✅ |
| `test/yatirim-skoru.spec.ts` | Unit — yatırım skoru + ROI + kira | ✅ |
| `test/fiyat-engine.spec.ts` | Unit — fiyat motoru | ✅ |
| `test/deprem-tdth.spec.ts` | Unit — AFAD TDTH | ✅ |
| `backend/api/test/health.spec.ts` | Integration — health + CORS | ✅ |
| `backend/api/test/ai-fiyat.spec.ts` | Integration — AI fiyat proxy | ✅ |

### Ürün ilkeleri (AI özellikleri)

1. **Açıklanabilir skor** — kara kutu yok; her puanın faktörü UI'da.
2. **Tavsiye değil** — gelecek değer, imar tahmini ve chat metinlerinde yasal disclaimer.
3. **Önce mevcut veri** — yeni özellik önce D1 / e-Plan / uydu / trend'i tüketir; yeni API son çare.
4. **Tier** — Avcı + dijital ikiz + sınırsız chat → Pro / Pro+; temel skor ücretsiz teaser.
5. **Server-side prompt** — AI prompt'ları client'tan gelmez, server-side oluşturulur (güvenlik).

---

## Veri Genişletme

### Mevcut Durum (Temmuz 2026)

| # | Veri | Durum | Kaynak |
|---|---|---|---|
| 1 | Parsel sınır + ada/parsel | ✅ Tam | TKGM API |
| 2 | İmar durumu (TAKS/KAKS/Emsal/Maks Kat) | ✅ Tam | e-Plan |
| 3 | Eğim & yükseklik & bakı yönü | ✅ Tam | Open-Meteo Elevation |
| 4 | OSM POI/yol mesafesi | ✅ Multi-radius (1/5/15 km) + fuel/trafo + Dexie cache | Overpass |
| 5 | Risk faktörleri (sit/askeri/zeytinlik/orman/mera) | ⚠️ Heuristic | Parsel nitelik + e-Plan metni regex |
| 6 | Emsal ilan fiyatları | ✅ Tam | Sahibinden + Hepsiemlak content scriptleri |
| 7 | TKGM satış yoğunluğu (heatmap) | ✅ Tam | TKGM analiz API |
| 8 | Deprem risk skoru | ✅ AFAD TDTH + PGA bantlı fiyat çarpanı | AFAD TDTH + IL_DEPREM |
| 9 | İklim (yağış/sıcaklık/nem) | ✅ Tam | Open-Meteo Archive |
| 10 | Toprak tipi & organik madde | ✅ Tam | ISRIC SoilGrids |
| 11 | OSB/Sanayi koordinat | ⚠️ OSM zayıf | — |
| 12 | Havalimanı/liman koordinat | ⚠️ OSM zayıf | — |
| 13 | Nüfus yoğunluğu | ❌ Eksik | — |
| 14 | Sel/taşkın riski | ❌ Eksik | — |
| 15 | Heyelan duyarlılık | ❌ Eksik | — |
| 16 | Tapu gerçek satış fiyatı | ❌ Kapalı | — |
| 17 | KGM resmi yol haritası | ⚠️ OSM | — |

### Genel Durum (Temmuz 2026)

Tüm Faz A–C **tamamlandı**. Ürün roadmap'i işlevsel:
- Backend: Cloudflare Workers + D1, `/v1/arazi-avci`, `/v1/ai-danisman`, `/v1/imar-degisim`, sorgu/trend, harita
- Extension: GelecekDegerKarti, AraziAvciKarti, TrendGrafik, AIDanismanKarti, ImarDegisimSinyalKarti, DijitalIkizKarti
- Site: SEO landings, `/sorgu`, veri kataloğu
- Test kapsamı: 33+ unit test geçiyor, integration testleri yazıldı

### Veri Faz 2 — Statik dataset (sonraki öncelik)

| Adım | Veri | Yöntem | Kapsam |
|---|---|---|---|
| 6 | OSB/Sanayi koordinatları | OSBÜK web → JSON dataset | 350+ OSB |
| 7 | Havalimanı koordinatları | DHMİ liste → manuel JSON | 56 havalimanı |
| 8 | Liman koordinatları | UDHB liste → manuel JSON | 30 liman |
| 9 | TÜİK nüfus | TÜİK CSV download → Cadastrum cache | Tüm mahalleler |

### Veri Faz 3 — Uzun vade (resmi başvuru / anlaşma)

| Adım | Veri | Yol |
|---|---|---|
| 10 | DSİ taşkın haritası | DSİ Genel Müdürlüğü resmi veri talebi |
| 11 | AFAD ARAS heyelan | AFAD resmi başvuru |
| 12 | TKGM tapu satış fiyatı | TKGM kurumsal anlaşma + lisans |
| 13 | KGM resmi yol haritası | Karayolları açık veri portal talebi |

---

### Veri prensipleri

1. **Cadastrum içinde çöz** — Kullanıcıyı dış kuruma "git şuraya bak" diye yönlendirme yok.
2. **Veri yetersiz ise dürüst ol** — Default 50km cezalandırması yok; veri yoksa skor null + nötr açıklama.
3. **Akıllı çıkarımlar** — Yapı yoğunluğu altyapı sinyali, vb. sağlam proxy'ler.
4. **Tüm veriler cache'li** — Dexie (extension) + KV (gelecek backend) ile zero-network repeat queries.
5. **Fiyat / AI motoruna besle** — Her yeni katman fiyat, gelecek skor, imar sinyali ve dijital ikize input olur.
