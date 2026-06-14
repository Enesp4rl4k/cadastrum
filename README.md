# Arsa TKGM Parsel — Chrome Extension

Chrome side-panel uygulaması. Haritada bir noktaya tıkla → TKGM'nin public CBS API'sinden parsel bilgisini (il/ilçe/mahalle/ada/parsel/alan/nitelik + polygon) çek ve göster.

## Stack

- Chrome MV3 + **Side Panel API** (Chrome 114+)
- Vite + CRXJS + React 18 + TypeScript
- Tailwind CSS
- MapLibre GL (vector/raster harita)
- Dexie (IndexedDB — favoriler + sorgu geçmişi)

## Geliştirme

```bash
npm install
npm run dev
```

Sonra Chrome'da `chrome://extensions` → "Developer mode" → "Load unpacked" → bu projenin `dist/` klasörünü seç. Geliştirme sırasında HMR çalışır, manifest değişikliğinde extension'ı reload et.

## Build

```bash
npm run build
# dist/ klasörü yüklemeye hazır
```

## API

Tüm istekler `https://cbsapi.tkgm.gov.tr/megsiswebapi.v3.1/api/*` üzerinden gider. Detaylar için `recon/WEEK1_FEASIBILITY.md`.

## Kullanım

1. Toolbar'daki extension ikonuna tıkla → side panel açılır.
2. Haritada bir noktaya tıkla → parsel sorgulanır, polygon çizilir, alttaki panelde detaylar görünür.
3. Atlas/parselsorgu sayfalarında sağ tık → "Bu noktayı TKGM'de sorgula" ile de panel açılabilir (koordinat aktarımı v0.2'de).

## Yol haritası

- [x] Hafta 1 — feasibility, public API doğrulandı
- [x] Hafta 2 — MV3 + side panel + harita + tıkla-sorgula MVP
- [ ] Hafta 3 — favoriler UI'ı, sorgu geçmişi sayfası
- [ ] Hafta 4 — ada/parsel ile arama (il/ilçe/mahalle dropdown'ları)
- [ ] Hafta 5 — toplu sorgu (CSV/KML import-export)
- [ ] Hafta 6 — atlas.tkgm.gov.tr içine content-script overlay (sağ tık → koordinat → panel)
- [ ] Hafta 7 — bağımsız bölüm / kat mülkiyeti detay paneli
