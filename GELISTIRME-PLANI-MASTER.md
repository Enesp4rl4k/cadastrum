# Cadastrum — Master Geliştirme Planı
> **Tarih:** 2026-08-01  
> **Kaynak:** Tüm V1–V5 planları + ROADMAP + FUTURE_ARCHITECTURE + kaynak kodu incelemesi  
> **Amaç:** Tek, yetkili referans plan — V1–V5 dağınıklığını ortadan kaldırır

---

## 1. Projenin Gerçek Durumu (Dürüst Audit)

### Ne Çalışıyor ✅
| Alan | Durum |
|------|-------|
| Chrome Extension (side panel, 9 tab) | Üretimde, v0.4 |
| Backend: Hono + Cloudflare Workers + D1 | 25+ route, 20+ tablo, deploy edilmiş |
| Fiyat motoru (heuristic + AI) | ~2050 satır, 119 test, çalışıyor |
| TKGM parsel + e-Plan imar sorgusu | Tam entegre |
| 65k mahalle AI baseline | D1'de mevcut |
| Spatial emsal (IDW, weighted median) | Çalışıyor |
| Deprem/iklim/toprak veri katmanları | Entegre |
| Auth + abonelik (LemonSqueezy) | Çalışıyor |
| Site (Astro, 110+ sayfa) | Cloudflare Pages'te deploy |
| AI Ajan / Fırsat Avcısı (backend) | `ai-ajan.ts` implement edilmiş |
| Cron: istatistik + bildirim + scraper | 4 trigger çalışıyor |
| Scraper: Emlakjet + Sahibinden | Implement edilmiş |

### Kritik Eksikler / Boşluklar ❌⚠️
| Alan | Sorun | Etki |
|------|-------|------|
| `nl-sorgu.ts` | Lib var, hiçbir UI'a bağlı değil | Yüksek — "Ara" tab boş potansiyel |
| `FiyatTahminKarti` `gerekce` alanı | Hesaplanıyor ama UI'da gösterilmiyor | Yüksek — sıfır ek maliyet, anında değer |
| `kira-getirisi.ts` | Lib var, UI'da yok | Orta |
| `nl-sorgu` → AraView bağlantısı | `AraView.tsx` NL input yok | Yüksek |
| Portföy sadece `chrome.storage` | Multi-device yok, kayıp riski | Orta |
| PDF rapor | Sadece HTML çıktı var | Orta (kurumsal müşteri) |
| Sentry / hata izleme | Entegre değil | Orta (operasyonel kör nokta) |
| `BolgeView.tsx` 1266 satır monolith | Test edilemez, bakımı zor | Teknik borç |
| `FiyatTahminKarti.tsx` 1002 satır | Test edilemez | Teknik borç |
| TÜİK mahalle nüfusu | `mahalle-nufus.ts` stub, dolu değil | Orta |
| Taşkın/heyelan veri | Lib var (`taskin-koord.ts`, `heyelan.ts`), veri yok | Orta |
| AI Ajan UI | Backend tam, extension/site UI yok | Yüksek |
| LemonSqueezy VARIANT_TIER mapping | `lemon.ts`'te boş | Kritik — abonelik kırık |
| Chrome Web Store v0.4 yayını | Hazır ama yayınlanmamış | Kritik |

---

## 2. Teknoloji Yığını (Referans)

```
Extension   : React 18 + TypeScript + Tailwind v3 + Dexie (IDB) + MapLibre
Backend     : Hono.js + Cloudflare Workers + D1 + R2 + KV
Site        : Astro + Tailwind + Cloudflare Pages
AI          : Gemini 2.5 Flash (primary) + Groq (fallback)
Abonelik    : LemonSqueezy
Monitoring  : Telemetri endpoint var, Sentry YOK
Test        : Vitest (119 test extension, partial backend)
```

---

## 3. Sprint Planı

### 🔴 Sprint 0 — Kritik Operasyonel (BU HAFTA, ~1 gün)
**Bloke edici sorunlar — bunlar olmadan hiçbir şey tam çalışmaz.**

| # | Görev | Dosya/Komut | Başarı Kriteri |
|---|-------|-------------|----------------|
| 0.1 | **LemonSqueezy VARIANT_TIER mapping doldur** | `backend/api/src/routes/lemon.ts` | Abonelik webhook doğru tier atar |
| 0.2 | **Chrome Web Store v0.4 yayını** | `npm run release:store` | Extension CWS'de canlı |
| 0.3 | D1 migration 0020+0021 canlı DB'ye uygula | `wrangler d1 execute` | Hata yok |
| 0.4 | Emlakjet 81 il scrape (eğer eksikse) | `SEED-EMLAKJET-FULL.bat` | D1'de ≥50k ilan |
| 0.5 | İstatistik refresh tetikle | `/v1/istatistik/refresh` | `mahalle_istatistik` dolu |

---

### 🔴 Sprint 1 — Hızlı Kazanımlar (1-2 gün, sıfır yeni API)
**Mevcut kodda gizli değer — sadece "göster" işlemi.**

#### 1.1 — AI Gerekçe Göster (`FiyatTahminKarti.tsx`)
`aiFiyat.gerekce` zaten hesaplanıyor, UI'da hiç gösterilmiyor.
```tsx
// FiyatTahminKarti.tsx ~satır 200 sonrası
{aiFiyat?.gerekce && (
  <details className="mt-2 text-xs">
    <summary className="cursor-pointer font-medium text-blue-700">
      🤖 AI neden bu fiyatı belirledi?
    </summary>
    <p className="mt-1 text-slate-600 leading-relaxed">{aiFiyat.gerekce}</p>
  </details>
)}
```

#### 1.2 — Kira Getirisi UI (`FiyatTahminKarti.tsx`)
`kira-getirisi.ts` lib çalışıyor, FiyatTahminKarti'ye accordion ekle.
- Gross yield: `yillik_kira / satis_fiyati × 100`
- Mortgage taksit hesabı basit formu

#### 1.3 — NL Sorgu → AraView Bağlantısı
`nl-sorgu.ts` implement edilmiş, `AraView.tsx`'e text input ekle:
```
Kullanıcı: "Beykoz'da 1000m² imar var arsa"
→ nl-sorgu.ts parse → {il: istanbul, ilce: beykoz, minM2: 1000, imarli: true}
→ /v1/emsal/spatial + filter → sonuç listesi
```

---

### 🟠 Sprint 2 — Fiyat Motoru Kalibrasyonu (2-3 gün)
**Sprint 0 tamamlandıktan sonra — gerçek D1 verisiyle kalibrasyon.**

| # | Görev | Dosya |
|---|-------|-------|
| 2.1 | Backtest: D1 vs baseline karşılaştırması | `scripts/backtest-baseline.mjs` |
| 2.2 | Bias kalibrasyon güncelle | `scripts/kalibrasyon.mjs` |
| 2.3 | `kalibre-katsayilar.json` → baseline-engine'e yükle | `scripts/baseline-ts-uret.mjs` |
| 2.4 | Outlier IQR multiplier review | `src/lib/fiyat-correction.ts` |
| 2.5 | `fiyat.ts toplu-ozet` O(n²) → Map O(n) | `backend/api/src/routes/fiyat.ts:242` |

---

### 🟠 Sprint 3 — Push Alarm + PDF Rapor (2-3 gün)
**Pro kullanıcı retansiyonu için kritik.**

#### 3.1 — Push Alarm (Chrome Notifications)
```typescript
// service-worker.ts — chrome.alarms API
chrome.alarms.create("fiyat-kontrol", { periodInMinutes: 60 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "fiyat-kontrol") return;
  const changes = await fetch("/v1/bildirim/kontrol", { headers: { Authorization: jwt } });
  if (changes.some(c => Math.abs(c.degisimYuzde) > 10)) {
    chrome.notifications.create({ type: "basic", title: "Fiyat Değişimi", message: ... });
  }
});
```
- `bildirim` tablosu D1'de zaten var
- `bildirim-cron.ts` backend'de zaten çalışıyor
- Sadece extension service-worker tarafı eksik

#### 3.2 — PDF Rapor (CSS Print)
- `src/rapor/rapor.css`'e `@media print` kuralları ekle
- `RaporView.tsx`'e print butonu
- Alternatif: `window.print()` → PDF (sıfır ek bağımlılık)

---

### 🟠 Sprint 4 — Gözlemlenebilirlik (1-2 gün)
**Operasyonel kör nokta — üretim hatalarını göremiyoruz.**

| # | Görev | Dosya |
|---|-------|-------|
| 4.1 | Sentry DSN al + `telemetri.ts`'e entegre | `src/lib/telemetri.ts` |
| 4.2 | Backend Sentry Workers SDK | `npm install @sentry/cloudflare` |
| 4.3 | `lib/logger.ts` kullanımını kritik route'lara yay | `auth.ts`, `ai-fiyat.ts`, `lemon.ts` |
| 4.4 | D1 yavaş sorgu tespiti (500ms+ log) | yeni middleware wrapper |

---

### 🟠 Sprint 5 — Portföy Sunucuya Persist (3-4 gün)
**Multi-device senkron — Pro özelliği.**

```sql
-- D1 migration
CREATE TABLE portfoy (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kullanici_id INTEGER NOT NULL,
  parsel_key TEXT NOT NULL,
  il TEXT, ilce TEXT, ada TEXT, parsel TEXT,
  fiyat_tahmini INTEGER,
  not TEXT,
  eklendi INTEGER DEFAULT (unixepoch()),
  UNIQUE(kullanici_id, parsel_key)
);
```

Backend route'lar:
- `GET /v1/portfoy` — kullanıcının portföyü (JWT)
- `POST /v1/portfoy` — parsel ekle
- `DELETE /v1/portfoy/:id` — sil
- `PATCH /v1/portfoy/:id` — not güncelle

Extension: `karsilastirma-store.tsx` → backend sync (optimistic UI)

---

### 🟡 Sprint 6 — Eksik Veri Katmanları (3-5 gün)
**ROADMAP.md Faz 2 — statik dataset üretimi.**

| # | Veri | Yöntem | Dosya |
|---|------|--------|-------|
| 6.1 | TÜİK mahalle nüfusu (2023) | TÜİK adrese-dayalı CSV | `src/lib/data/mahalle-nufus.ts` |
| 6.2 | Taşkın koordinat (GloFAS) | Open-Meteo flood API | `src/lib/taskin-koord.ts` |
| 6.3 | Heyelan duyarlılık | AFAD WMS veya OpenLandMap | `src/lib/heyelan.ts` |
| 6.4 | OSB/Sanayi koordinatları | OSBÜK → JSON | `src/lib/statik-lojistik.ts` |
| 6.5 | DogalVeriKarti UI entegrasyonu | 6.2+6.3 sonrası | `DogalVeriKarti.tsx` |

---

### 🟡 Sprint 7 — Harita Fiyat Isı Haritası (2-3 gün)
**Site + extension için görsel etki.**

```typescript
// Site harita.astro: /v1/fiyat/toplu-ozet → MapLibre FillLayer
// Extension MapView: ilçe zoom → /v1/fiyat/toplu-ilce-ozet/:il → mahalle hover popup
// Renk skalası: quantile tabanlı, kırmızı (pahalı) → mavi (ucuz)
// Tooltip: ilçe adı + medyan TL/m² + ilan adet
```

---

### 🟡 Sprint 8 — Teknik Borç (paralel, fırsatça)
**Devam eden bakım — her sprint'te biraz.**

| Dosya | Sorun | Hedef |
|-------|-------|-------|
| `BolgeView.tsx` (1266 satır) | Monolith | Sub-component'lere böl |
| `FiyatTahminKarti.tsx` (1002 satır) | Logic + UI karışık | Hook'a çıkar: `useFiyatTahmin()` |
| `nl-sorgu.ts` | Test yok | Unit test ekle |
| `kira-getirisi.ts` | Test zayıf | Entegrasyon testi |
| Backend `as any` cast'ler | Type-unsafe | `AppVariables` tipini kullan |

---

### 🔵 Sprint 9 — AI Ajan UI (3-4 gün)
**Backend tamamen hazır, sadece UI eksik.**

`ai-ajan.ts` (401 satır) implement edilmiş:
- `POST /v1/ai-ajan/firsat` — Gemini Function Calling
- Spatial search + Milli Emlak ihale + bölge skoru

Yapılacak:
- Extension: `LabView.tsx`'e "Fırsat Avcısı" section
- Doğal dil input → backend → sonuç listesi → haritada göster
- Site: `sorgu.astro`'ya NL arama kutusu entegrasyonu

```tsx
// LabView.tsx içine eklenecek
function FirsatAvciPanel() {
  const [sorgu, setSorgu] = useState("");
  const [sonuclar, setSonuclar] = useState<FirsatSonucu[]>([]);
  // POST /v1/ai-ajan/firsat → sonuçları listele + haritada pin
}
```

---

### 🔵 Sprint 10 — Uydu AI Analizi (2-3 hafta)
**V5 Özellik 1 — yüksek etki, makul maliyet.**

```
Koordinat → Sentinel Hub API → 256×256 PNG (NDVI + gerçek renk)
→ Gemini Vision → { degisimler, risk, potansiyel }
```

Dosyalar:
- `src/lib/sentinel-goruntu.ts` — API client
- `backend/api/src/routes/uydu.ts` — proxy + Gemini Vision
- `src/sidepanel/components/UyduAnalizKarti.tsx` — slider UI

Maliyet: ~$0.25/1000 analiz (Gemini Vision) + Sentinel Hub ücretsiz tier

---

### 🔵 Sprint 11 — Embed Widget + API v2 (2-3 hafta)
**B2B gelir kanalı.**

- `site/src/pages/embed/fiyat.astro` — iframe-friendly minimal UI
- `GET /embed/fiyat?il=istanbul&ilce=besiktas` → anlık medyan
- CORS: `origin: *` sadece embed endpoint
- Rate limit: host domain'e göre token
- Batch API: `POST /v2/fiyat/batch` — 500 koordinat → 500 tahmin (async job)

---

### 🔵 Sprint 12 — Cadastrum Fiyat Endeksi (1+ ay)
**Uzun vadeli ürün farklılaştırması.**

- Backend aylık cron: D1 ilanlardan il/kategori bazlı endeks
- `POST /v1/api/endeks` → zaman serisi (2023–bugün)
- Site: `veri/index.astro`'da görsel grafik
- TCMB KFE karşılaştırması
- Kurumsal API tier'ı için yüksek değer

---

## 4. Bağımlılık Grafiği

```
Sprint 0 (deploy/data)
    ↓
Sprint 1 (hızlı kazanım)    Sprint 4 (Sentry) — bağımsız
    ↓
Sprint 2 (kalibrasyon)
    ↓
Sprint 3 (alarm + PDF)      Sprint 5 (portföy) — bağımsız
    ↓
Sprint 6 (veri katmanları)
    ↓
Sprint 7 (ısı haritası)
    ↓
Sprint 9 (AI ajan UI)
    ↓
Sprint 10 (uydu AI)
Sprint 11 (embed/API v2)
Sprint 12 (endeks)
```

Sprint 8 (teknik borç) her sprint'te paralel sürer.

---

## 5. Öncelik Matrisi

```
ETKİ ↑
  │  Sprint 0  Sprint 1  Sprint 9  Sprint 10
  │  Sprint 3  Sprint 5  Sprint 7  Sprint 11
  │  Sprint 2  Sprint 4  Sprint 6  Sprint 12
  │  Sprint 8 (borç)
  └──────────────────────────────────────── HIZLILIK →
     BU HAFTA  1. AY     2. AY     3. AY+
```

---

## 6. Teknik Risk Listesi

| Risk | Olasılık | Etki | Azaltma |
|------|---------|------|---------|
| Sahibinden PerimeterX engeli | Yüksek | Orta | Emlakjet primary, Sahibinden bonus |
| Cloudflare Worker 30s CPU limiti | Orta | Orta | `ctx.waitUntil` + batch bölme |
| Gemini API kota/maliyet artışı | Düşük | Yüksek | Groq fallback zaten var |
| D1 row limit (10M ücretsiz) | Düşük | Orta | Eski ilanları archive/delete |
| LemonSqueezy webhook kaçırma | Orta | Yüksek | `webhook_idempotency` tablosu zaten var |
| Sentinel Hub ücretsiz kota (30k/ay) | Orta | Düşük | Rate limit + Dexie cache |

---

## 7. KPI Hedefleri

| Metrik | Şimdi | 1 Ay | 3 Ay |
|--------|-------|------|------|
| CWS aktif kullanıcı | ? | 100 | 500 |
| Aylık aktif Pro abonelik | 0 | 10 | 50 |
| D1 ilan sayısı | ~50k | 100k | 300k |
| Fiyat tahmini MAPE | ? | <25% | <15% |
| Backend p95 latency | ? | <500ms | <300ms |

---

## 8. Hemen Yapılacaklar (Sıralı, Bugün Başla)

1. **`lemon.ts` VARIANT_TIER mapping** — 30 dk, kritik, abonelik kırık
2. **`FiyatTahminKarti.tsx` gerekce göster** — 15 dk, sıfır maliyet, anında Pro değeri
3. **CWS v0.4 yayını** — `npm run release:store`, gecikme yok
4. **D1 migration 0020+0021** — deploy gerekli, bloke edici
5. **AraView NL input** — `nl-sorgu.ts` lib hazır, 2-3 saat UI bağlantısı
