# Cadastrum

Türkiye arsa ve parsel analizi platformu — Chrome uzantısı, REST API ve tanıtım sitesi tek monorepo'da.

Haritada bir noktaya tıklayın → TKGM parsel sınırı, e-Plan imar durumu, 65.000+ mahalle bazlı fiyat tahmini, emsal triangulation, deprem/taşkın riski, TCMB konut fiyat endeksi ve daha fazlası.

**Sürüm:** `0.3.2` (extension)

## Monorepo yapısı

```
cadastrum/
├── src/                 # Chrome MV3 uzantısı (Vite + React + MapLibre)
├── backend/api/         # Cloudflare Workers + D1 REST API (Hono)
├── site/                # Tanıtım ve hesap sayfaları (Astro)
├── scripts/             # Veri pipeline, scraper, seed SQL
├── data/                # Kalibrasyon ve kalite raporları
├── docs/                # İç planlama ve operasyon dokümanları
├── marketing/           # Lansman ve sosyal medya materyalleri
├── chrome-store/        # Web Store listing ve görseller
└── recon/               # TKGM API araştırması
```

## Özellikler (extension)

| Alan | Kaynak |
|------|--------|
| Parsel sınır, ada/parsel, alan, nitelik | TKGM CBS API |
| İmar (TAKS/KAKS/emsal/maks kat) | e-Plan |
| Mahalle/ilçe/il fiyat tahmini | 65k mahalle AI baseline + canlı ilan triangulation |
| Emsal ilan karşılaştırma | Sahibinden + Hepsiemlak content script |
| Deprem riski (PGA bantlı fiyat çarpanı) | AFAD TDTH |
| İklim, toprak, eğim, OSM çevre | Open-Meteo, ISRIC, Overpass |
| TKGM satış yoğunluğu heatmap | TKGM analiz API |
| Favoriler, geçmiş, toplu sorgu, CSV/KML | Dexie (IndexedDB) |

## Hızlı başlangıç

### Chrome uzantısı

```bash
npm install
npm run dev          # HMR ile geliştirme
npm run build        # dist/ — yükleme paketi
npm test             # Vitest
```

Chrome'da `chrome://extensions` → Geliştirici modu → Paketlenmemiş öğe yükle → `dist/`

### Backend API

```bash
cd backend/api
npm install
npm run db:migrate-local
npm run dev          # http://localhost:8787
```

Detaylar: [backend/api/README.md](./backend/api/README.md)

### Site

```bash
cd site
npm install
npm run dev          # http://localhost:4321
npm run build
```

Detaylar: [site/README.md](./site/README.md)

## Stack

| Katman | Teknoloji |
|--------|-----------|
| Extension | Chrome MV3, Side Panel API, Vite, CRXJS, React 18, TypeScript, Tailwind, MapLibre GL, Dexie |
| API | Hono, Cloudflare Workers, D1, Wrangler |
| Site | Astro, Tailwind |
| CI | GitHub Actions — extension build/test, backend test, site build |

## Windows kısayolları (kök dizin)

Veri seed, scraper ve deploy için `.bat` dosyaları repo kökünde:

| Script | Amaç |
|--------|------|
| `DEPLOY-BACKEND.bat` | API production deploy |
| `DEPLOY-SITE.bat` | Site deploy |
| `SEED-EMLAKJET*.bat` | Emlakjet verisini D1'e yükle |
| `SCRAPE-EMLAKJET*.bat` | Emlakjet scraper çalıştır |
| `RUN-SCRAPE-*.bat` | Sahibinden baseline scrape |
| `VERI-KALITE.bat` | Veri kalite raporu |

## Dokümantasyon

- [docs/README.md](./docs/README.md) — planlama, operasyon, mimari
- [docs/ROADMAP.md](./docs/ROADMAP.md) — veri katmanları ve faz durumu
- [recon/WEEK1_FEASIBILITY.md](./recon/WEEK1_FEASIBILITY.md) — TKGM public API notları

## API özeti

Tüm public endpoint'ler `https://cadastrum-api.cadastrum-tr.workers.dev/v1` altında:

```
GET  /health
GET  /fiyat/mahalle/:il/:ilce/:mahalle
POST /ilan              # Extension ilan ingest
POST /auth/kayit        # Hesap oluşturma
GET  /api/*             # Kurumsal API (X-API-Key)
```

OpenAPI: [backend/api/openapi.yaml](./backend/api/openapi.yaml)

## Lisans

Özel proje (`private: true`). Dağıtım ve kullanım koşulları için [site/src/pages/kullanim-sartlari.astro](./site/src/pages/kullanim-sartlari.astro) sayfasına bakın.
