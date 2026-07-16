# Cadastrum — Türkiye Arsa & Parsel Analiz Platformu

> Tapu Kadastro (TKGM) verisiyle desteklenen, AI destekli arsa değerleme ve analiz platformu.
> Chrome Extension + Web Sitesi + REST API üçlüsü.

**[cadastrum.com.tr](https://cadastrum.com.tr)** · [Chrome Web Store](#) · [API Docs](https://cadastrum.com.tr/api-docs)

---

## Nedir?

Cadastrum, gayrimenkul profesyonellerinin ve bireysel yatırımcıların arsa/parsel kararlarını veri odaklı almalarına yardımcı olan bir platformdur.

- Haritada tıkla → parselin tüm teknik, hukuki ve piyasa verilerini anında gör
- AI ile 5 boyutlu arazi uygunluk analizi al (tarımsal, yapılaşma, lojistik, enerji, risk)
- Parseller arası karşılaştırma, fiyat trendi, emsal analizi
- Türkiye geneli tapu işlem yoğunluğu haritası

---

## Özellikler

### Chrome Extension

| Özellik | Açıklama |
|---|---|
| **Parsel Sorgulama** | Haritaya tıkla → TKGM'den ada/parsel/alan/nitelik + polygon |
| **İmar Durumu** | e-Plan entegrasyonu → TAKS/KAKS/emsal/kat |
| **Fiyat Tahmini** | Mahalle baseline + emsal + AI triangulation → TL/m² band |
| **AI Scorecard** | Gemini 2.5 Flash ile 5 boyutlu arazi uygunluk analizi |
| **Deprem Analizi** | AFAD TDTH koordinat bazlı PGA + deprem zonu |
| **Toprak & İklim** | SoilGrids (toprak tipi, organik madde) + Open-Meteo (yağış, sıcaklık) |
| **GES Potansiyeli** | PVGIS yıllık kWh/kWp güneş enerjisi verimi |
| **OSM Çevre Analizi** | Otoyol, OSB, havalimanı, liman, okul, hastane mesafeleri |
| **Emsal Mukayese** | Sahibinden + Hepsiemlak + Emlakjet emsal ilanları |
| **Favori & Karşılaştırma** | Parselleri kaydet, yan yana karşılaştır |
| **PDF Rapor** | Tek tıkla yazdırılabilir analiz raporu |
| **Bildirim Kuralları** | Fiyat eşiği veya imar değişikliği bildirimi |

### Web Sitesi (cadastrum.com.tr)

| Sayfa | İçerik |
|---|---|
| **/harita** | Türkiye tapu işlem yoğunluğu haritası — TKGM resmi veri |
| **/sorgu** | Haritaya tıkla → parsel değer sorgusu |
| **/veri** | İl/ilçe bazlı TL/m² medyan fiyat sayfaları |
| **/api-docs** | Public API dokümantasyonu |

**Harita Katmanları:**
- 🏭 OSB'ler (250+ organize sanayi bölgesi)
- ✈️ Havalimanları (56 adet)
- ⚓ Liman & Lojistik Merkezler
- 🏛️ Serbest Ticaret Bölgeleri (21 STB)
- 🌾 TMO Alım Merkezleri (115 depo)
- 💧 Büyük Barajlar (17 adet, MW kapasiteli)
- ⚡ Enerji Santralleri (termik, nükleer, RES, GES)
- 🛣️ Otoyol & D-yolları
- 💰 TL/m² Fiyat Choropleth
- 💧 Piyasa Likiditesi
- 🌡️ Fiyat Trendi
- 🗺️ ÇDP İmar Planı (TUCBS WMS)

---

## Tech Stack

### Chrome Extension
```
Chrome MV3 + Side Panel API
Vite + CRXJS + React 18 + TypeScript (strict)
Tailwind CSS + MapLibre GL
Dexie (IndexedDB — offline cache)
TanStack Query · Zustand · React Hook Form + Zod
```

### Backend (Cloudflare Workers + D1)
```
Hono (edge-native HTTP framework)
Cloudflare D1 (SQLite at edge) — 20+ tablo
Cloudflare KV (session/cache)
Gemini 2.5 Flash (primary AI) + Groq Llama 3.3 70B (fallback)
```

### Web Sitesi
```
Astro 4 (SSG/SSR hybrid)
Tailwind CSS
MapLibre GL JS
Cloudflare Pages
```

---

## Veri Kaynakları

| Kaynak | Veri | Güncelleme |
|---|---|---|
| **TKGM CBS API** | Parsel sınır, ada/parsel, nitelik | Anlık |
| **e-Plan** | İmar durumu (TAKS/KAKS/emsal/kat) | Anlık |
| **AFAD TDTH** | Deprem PGA koordinat bazlı | 90 gün cache |
| **ISRIC SoilGrids** | Toprak tipi, organik madde % | 90 gün cache |
| **Open-Meteo Archive** | Yıllık yağış, sıcaklık, nem | 30 gün cache |
| **PVGIS (JRC)** | GES kWh/kWp yıllık verim | 30 gün cache |
| **Overpass (OSM)** | POI mesafeleri, yol ağı | 7 gün cache |
| **Emlakjet / Sahibinden** | Emsal ilan fiyatları | Günlük scrape |
| **Sahibinden content script** | Kullanıcı browse'larken otomatik | Gerçek zamanlı |
| **TUCBS WMS** | Çevre Düzeni Planı katmanı | Tile cache |

---

## Kurulum

### Extension (Geliştirme)

```bash
# Bağımlılıkları yükle
npm install

# Geliştirme modu (HMR)
npm run dev

# Chrome: chrome://extensions → Developer mode → Load unpacked → dist/
```

### Extension (Build)

```bash
npm run build
# dist/ klasörü Chrome'a yüklenmeye hazır
```

### Backend

```bash
cd backend/api
npm install

# Geliştirme
npx wrangler dev

# Production deploy
npx wrangler deploy
```

```bash
# Gerekli secrets
wrangler secret put GEMINI_API_KEY
wrangler secret put GROQ_API_KEY
wrangler secret put JWT_SECRET
```

### Web Sitesi

```bash
cd site
npm install

# Geliştirme
npm run dev

# Build
npm run build
```

---

## Veri Script'leri

```bash
# Otoyol dataset'ini güncelle (Overpass'tan motorway + trunk çeker, ~5dk)
node scripts/extract-otoyollar.mjs

# TMO alım merkezlerini geocode et (Nominatim, ~3dk)
node scripts/geocode-tmo.mjs

# Emlakjet il/ilçe fiyat verisi çek
node scripts/emlakjet-scrape.mjs

# AI mahalle baseline üret
node scripts/backend-seed-ai.mjs

# TKGM tapu yoğunluk haritası seed
node scripts/tkgm-analiz-seed.mjs
```

---

## Mimari

```
arsa-tkgm-extension/
├── src/                      # Chrome Extension
│   ├── sidepanel/            # React side panel UI
│   │   ├── components/       # ParselDetay, AnalizPanel, ScorecardKarti...
│   │   └── views/            # MapView, FavorilerView, KarsilastirmaView...
│   ├── lib/                  # İş mantığı
│   │   ├── data/             # Statik dataset'ler (OSB, havalimanı, otoyol...)
│   │   ├── ai-scorecard.ts   # AI Scorecard API client
│   │   ├── fiyat-tahmin.ts   # Fiyat tahmin motoru
│   │   ├── osm.ts            # Overpass POI sorgusu
│   │   └── statik-lojistik.ts # Statik koordinat dataset lookup
│   ├── content/              # Sahibinden + Hepsiemlak content script
│   └── background/           # Service worker + scraping runtime
│
├── backend/api/src/          # Cloudflare Workers API
│   ├── routes/               # ai-fiyat, ai-scorecard, harita, fiyat...
│   ├── db/                   # SQL migration dosyaları
│   └── lib/                  # Scraper, istatistik, normalize
│
├── site/                     # Astro web sitesi
│   ├── src/pages/            # harita, sorgu, veri, fiyat...
│   └── src/scripts/          # harita-init.ts (MapLibre)
│
└── scripts/                  # Data pipeline script'leri
```

---

## API (Beta)

```bash
# Parsel fiyat sorgusu
GET /v1/fiyat/mahalle?il=istanbul&ilce=besiktas&mahalle=levent&kategori=arsa

# AI Scorecard
POST /v1/ai-scorecard/analiz
Authorization: Bearer <token>

# Harita tapu yoğunluğu
GET /v1/harita/analiz/birlesik?ilceKodu=1234&analizTip=1

# TL/m² fiyat choropleth
GET /v1/fiyat/toplu-ozet?kategori=arsa
```

Tam dokümantasyon: [cadastrum.com.tr/api-docs](https://cadastrum.com.tr/api-docs)

---

## Lisans

Kaynak kod **AGPL-3.0** lisansı ile korunmaktadır.  
Veri kaynakları kendi lisanslarına tabidir (TKGM, OSM ODbL, SoilGrids CC-BY).

---

*Cadastrum — Veriyle karar ver.*
