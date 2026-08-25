# Cadastrum — İleri Teknoloji Implementation Planı V10
> **Tarih:** 2026-08-06
> **Kapsam:** 6 yüksek teknoloji özelliğin mimari entegrasyonu
> **Ön koşul:** Kova 1 deploy/config tamamlanmış olmalı

---

## Özellik 1 — Cadex Fiyat Endeksi

### Ne
Türkiye'nin ilk arsa/tarla fiyat endeksi. TCMB KFE'ye alternatif, aylık yayınlanan,
il + kategori bazlı. Medya baskısı, kurumsal API satışı, SEO için kritik.

### Mevcut Durum
- `/v1/api/endeks` route → `backend/api/src/routes/endeks.ts` implement edilmiş
- `site/src/pages/endeks.astro` var
- D1'de `mahalle_istatistik` tablosu var, aylık cron çalışıyor

### Eksik Parçalar
1. D1'de `fiyat_endeksi` tablosu yok
2. Aylık endeks hesaplama cron yok
3. `endeks.astro`'da görsel grafik yok

### Mimari

```
D1: ilanlar tablosu (aylık ~5k yeni ilan)
         ↓ cron: "0 4 1 * *" (her ayın 1'i 04:00)
D1: fiyat_endeksi (il_norm, kategori, yil, ay, medyan, adet, baz_endeks)
         ↓ GET /v1/api/endeks?il=istanbul&kategori=arsa
site/src/pages/endeks.astro → Chart.js zaman serisi
```

### Implementation Adımları

**Adım 1 — D1 Migration**
```sql
-- backend/api/src/db/0024_endeks.sql
CREATE TABLE IF NOT EXISTS fiyat_endeksi (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  il_norm     TEXT NOT NULL,
  kategori    TEXT NOT NULL DEFAULT 'arsa',
  yil         INTEGER NOT NULL,
  ay          INTEGER NOT NULL,   -- 1-12
  medyan      INTEGER NOT NULL,   -- TL/m²
  adet        INTEGER NOT NULL,
  baz_endeks  REAL,               -- Ocak 2024 = 100
  hesaplandi  INTEGER DEFAULT (unixepoch()),
  UNIQUE(il_norm, kategori, yil, ay)
);
CREATE INDEX IF NOT EXISTS idx_endeks_il ON fiyat_endeksi(il_norm, kategori);
```

**Adım 2 — Endeks Hesaplama Servisi**
```typescript
// backend/api/src/routes/endeks.ts — endeksHesapla() fonksiyonu ekle
async function endeksHesapla(db: D1Database): Promise<{ hesaplanan: number }> {
  const simdi = new Date();
  const yil = simdi.getUTCFullYear();
  const ay = simdi.getUTCMonth() + 1;

  // Her il × kategori kombinasyonu için medyan hesapla
  const sonuc = await db.prepare(`
    INSERT OR REPLACE INTO fiyat_endeksi (il_norm, kategori, yil, ay, medyan, adet)
    SELECT
      il_norm,
      COALESCE(kategori, 'arsa') as kategori,
      ? as yil,
      ? as ay,
      CAST(AVG(fiyat_per_m2) as INTEGER) as medyan,
      COUNT(*) as adet
    FROM ilanlar
    WHERE
      tarih >= unixepoch('now', '-30 days')
      AND fiyat_per_m2 > 0
      AND fiyat_per_m2 < 5000000
      AND il_norm IS NOT NULL
    GROUP BY il_norm, kategori
    HAVING COUNT(*) >= 5
  `).bind(yil, ay).run();

  // Baz endeks güncelle (Ocak 2024 = 100 referans noktası)
  await db.prepare(`
    UPDATE fiyat_endeksi e
    SET baz_endeks = ROUND(
      (e.medyan * 100.0) / COALESCE(
        (SELECT medyan FROM fiyat_endeksi b
         WHERE b.il_norm = e.il_norm AND b.kategori = e.kategori
         AND b.yil = 2024 AND b.ay = 1), e.medyan
      ), 1
    )
    WHERE yil = ? AND ay = ?
  `).bind(yil, ay).run();

  return { hesaplanan: sonuc.meta.changes ?? 0 };
}
```

**Adım 3 — Cron Entegrasyonu**
```typescript
// backend/api/src/index.ts — scheduled() handler'a ekle
} else if (cron === "0 4 1 * *") {
  // Aylık endeks hesaplama
  ctx.waitUntil((async () => {
    const { endeksHesapla } = await import("./routes/endeks.js");
    const r = await endeksHesapla(env.DB);
    console.log("[cron-endeks] hesaplandi:", r.hesaplanan, "satir");
  })());
}
```

**Adım 4 — Site Grafiği**
```astro
<!-- site/src/pages/endeks.astro — Chart.js zaman serisi -->
<canvas id="endeks-grafik" width="800" height="400"></canvas>
<script>
  import Chart from 'chart.js/auto';
  const res = await fetch('/v1/api/endeks?kategori=arsa&limit=24');
  const { veri } = await res.json();
  new Chart(document.getElementById('endeks-grafik'), {
    type: 'line',
    data: {
      labels: veri.map(d => `${d.yil}/${d.ay}`),
      datasets: [{
        label: 'Türkiye Arsa Endeksi (Oca 2024 = 100)',
        data: veri.map(d => d.baz_endeks),
        borderColor: '#2563eb',
        tension: 0.3,
      }]
    }
  });
</script>
```

**Dosyalar:**
- `backend/api/src/db/0024_endeks.sql` (yeni)
- `backend/api/src/routes/endeks.ts` (güncelle)
- `backend/api/src/index.ts` (cron ekle)
- `site/src/pages/endeks.astro` (grafik ekle)

**Efor:** 3-4 gün | **Etki:** Yüksek (medya, SEO, kurumsal)

---

## Özellik 2 — Kurumsal API v2

### Ne
B2B gelir kanalı. Gayrimenkul şirketleri, bankalar, sigorta için:
- `POST /v2/degerle` → anlık değerleme
- `POST /v2/batch` → 500 koordinat async job
- Webhook: değer değişince notify

### Mevcut Durum
- `/v1/api/public-api.ts` var (X-API-Key token bazlı)
- `kullanicilar` tablosunda `api_key` sütunu var
- Rate limiting altyapısı var

### Mimari

```
İstemci (banka/gayrimenkul şirketi)
    ↓ POST /v2/degerle  {lat, lng, alan_m2?, kategori?}
    ↓ X-API-Key: cad_live_xxx
Cloudflare Worker
    ↓ API key doğrula + tier kontrol
    ↓ fiyatTahminEt() + ePlan proxy + emsal spatial
    ↓ { tahmin, guven, emsal_count, metodoloji }
İstemci ← JSON yanıt (<500ms)
```

### Yeni D1 Tabloları
```sql
-- 0025_api_v2.sql
CREATE TABLE IF NOT EXISTS api_jobs (
  id          TEXT PRIMARY KEY,   -- UUID
  api_key     TEXT NOT NULL,
  durum       TEXT DEFAULT 'bekliyor',  -- bekliyor|isleniyor|tamamlandi|hata
  istek_sayisi INTEGER DEFAULT 0,
  tamamlanan  INTEGER DEFAULT 0,
  sonuclar_r2 TEXT,               -- R2 key (büyük sonuçlar)
  olusturuldu INTEGER DEFAULT (unixepoch()),
  tamamlandi  INTEGER
);

CREATE TABLE IF NOT EXISTS api_webhooks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kullanici_id INTEGER NOT NULL,
  url         TEXT NOT NULL,
  events      TEXT DEFAULT 'deger-degisimi',
  aktif       INTEGER DEFAULT 1,
  olusturuldu INTEGER DEFAULT (unixepoch())
);
```

### Endpoint Yapısı
```typescript
// backend/api/src/routes/api-v2.ts (yeni dosya)

// POST /v2/degerle — tek koordinat, senkron
v2.post("/degerle", apiKeyMiddleware, async (c) => {
  const { lat, lng, alan_m2, kategori = "arsa" } = await c.req.json();
  // 1. Spatial emsal çek (500m radius)
  // 2. Baseline hesapla
  // 3. e-Plan proxy
  // Yanıt <500ms için cache-heavy
  return c.json({
    tahmin: { alt: X, beklenen: Y, ust: Z },
    guven: 75,
    emsal_count: 12,
    metodoloji: "spatial-radius",
    cached: false,
  });
});

// POST /v2/batch — async job, R2'ye sonuç yaz
v2.post("/batch", apiKeyMiddleware, rateLimitMiddleware(5, "api-v2-batch"), async (c) => {
  const { koordinatlar } = await c.req.json();   // max 500
  if (koordinatlar.length > 500) return c.json({ hata: "Max 500" }, 400);
  const jobId = crypto.randomUUID();
  await c.env.DB.prepare(
    "INSERT INTO api_jobs (id, api_key, istek_sayisi) VALUES (?, ?, ?)"
  ).bind(jobId, c.get("apiKey"), koordinatlar.length).run();
  // ctx.waitUntil ile arka planda işle
  c.executionCtx.waitUntil(batchIsle(c.env, jobId, koordinatlar));
  return c.json({ job_id: jobId, durum: "bekliyor" });
});

// GET /v2/batch/:id — job durumu
v2.get("/batch/:id", apiKeyMiddleware, async (c) => {
  const job = await c.env.DB.prepare(
    "SELECT * FROM api_jobs WHERE id = ? AND api_key = ?"
  ).bind(c.req.param("id"), c.get("apiKey")).first();
  return c.json(job ?? { hata: "Job bulunamadı" }, job ? 200 : 404);
});
```

**Dosyalar:**
- `backend/api/src/db/0025_api_v2.sql` (yeni)
- `backend/api/src/routes/api-v2.ts` (yeni)
- `backend/api/src/index.ts` (route ekle)
- `site/src/pages/api-docs.astro` (Redoc güncelle)

**Efor:** 1-2 hafta | **Etki:** Çok Yüksek (B2B gelir)

---

## Özellik 3 — Computer Vision (Parsel Görüntü Analizi)

### Ne
Koordinat → uydu görüntüsü → nesne tespiti. Üretim: "Bu parselde 120m² yapı var,
%40 bitki örtüsü, yola 15m mesafe."

### Mevcut Durum
- `UyduAnalizKarti.tsx` implement edilmiş
- `backend/api/src/routes/uydu.ts` var
- Gemini Vision entegre

### Mimari
```
Koordinat (lat, lng)
    ↓ Copernicus/Sentinel Hub API → 256×256 PNG (gerçek renk + NDVI)
    ↓ VEYA Google Maps Static API (daha ucuz, daha kolay)
    ↓ Base64 → Gemini Vision (flash-2.0)
    ↓ Structured output JSON:
{
  "yapiVar": true,
  "yapiAlanM2": 120,
  "bitkilikOrani": 0.35,
  "suKaynagiYakin": false,
  "yolaBaglanti": "asfaltyol",
  "yorumlar": ["Tek katlı yapı", "Bahçe düzenlemesi var"]
}
```

### Prompt Mühendisliği
```typescript
const VISION_PROMPT = `
Bu uydu görüntüsü bir Türkiye parseline ait. Analiz et:

1. Yapı var mı? Varsa tahmini alan m² (yapı footprint)
2. Bitki örtüsü oranı (0.0 - 1.0)
3. Su kaynağı yakını (dere, göl, sulama kanalı)
4. Yol bağlantısı türü (yok/toprak/asfalt/beton)
5. Parsel kullanım ipuçları

JSON formatında yanıt ver:
{"yapiVar":bool,"yapiAlanM2":int|null,"bitkilikOrani":float,
 "suKaynagiYakin":bool,"yolaBaglanti":"yok"|"toprak"|"asfalt",
 "yorumlar":string[]}
`;
```

### Fiyat Motoruna Entegrasyon
```typescript
// src/lib/fiyat-tahmin.ts — visionCarpani() fonksiyonu
function visionCarpani(vision: VisionSonuc | null): { carpan: number; not: string } {
  if (!vision) return { carpan: 1.0, not: "Uydu analizi yok" };
  let carpan = 1.0;
  if (vision.yapiVar && vision.yapiAlanM2 && vision.yapiAlanM2 > 50) carpan *= 1.15;
  if (vision.yolaBaglanti === "asfalt") carpan *= 1.08;
  if (vision.yolaBaglanti === "yok") carpan *= 0.88;
  if (vision.suKaynagiYakin) carpan *= 1.05;
  return { carpan, not: `Vision: yapı=${vision.yapiVar}, yol=${vision.yolaBaglanti}` };
}
```

**Maliyet:** ~$0.001/görüntü (Gemini Flash) + ~$0.002/görüntü (Sentinel Hub)
**Limit:** Pro tier: 10 analiz/gün, Kurumsal: 100/gün

**Dosyalar:**
- `backend/api/src/routes/uydu.ts` (güncelle — nesne tespiti ekle)
- `src/lib/vision-analiz.ts` (yeni — client-side tip tanımları)
- `src/sidepanel/components/UyduAnalizKarti.tsx` (güncelle — sonuçları göster)
- `src/lib/fiyat-tahmin.ts` (visionCarpani ekle)

**Efor:** 1-2 hafta | **Etki:** Yüksek (farklılaştırıcı)

---

## Özellik 4 — ML Fiyat Modeli (Heuristic Yerini Alır)

### Ne
XGBoost/LightGBM modeli → ONNX export → Cloudflare Workers AI'da inference.
Mevcut %25–80 hata payı → %10–15'e düşer.

### Veri Pipeline
```
D1 ilanlar (~150k satır)
    ↓ scripts/ml-veri-hazirla.mjs
    ├── Feature engineering:
    │   alan_m2, log_alan, imar_sinifi (onehot), il_norm, ilce_norm,
    │   nufus_yogunlugu, deprem_zonu (1-4), sahil_km, osb_km,
    │   hava_km, ay, yil, kategori (onehot)
    └── Target: log(fiyat_per_m2)  ← log transform ile normal dağılım

Python (lokal/Colab):
    sklearn pipeline → XGBoost → ONNX (opset 17)
    Model boyutu: ~2-5 MB
    Training süresi: ~5 dakika (150k satır)

ONNX → Cloudflare Workers AI:
    wrangler.toml: [ai] binding = "AI"
    inference: env.AI.run("@cf/onnx/model", { inputs })
```

### Mimari Entegrasyon
```typescript
// backend/api/src/lib/ml-model.ts (yeni)
export async function mlTahmin(
  env: Env,
  features: MLFeatures,
): Promise<{ beklenenPerM2: number; guven: number } | null> {
  if (!env.AI) return null;  // Workers AI binding yoksa fallback
  try {
    const input = featureVektoru(features);  // Float32Array
    const result = await env.AI.run("@cf/onnx/cadastrum-fiyat-v1", {
      input: Array.from(input),
    });
    const logFiyat = result.output[0];
    return {
      beklenenPerM2: Math.round(Math.exp(logFiyat)),
      guven: 85,  // ML model sabit yüksek güven
    };
  } catch {
    return null;  // Hata → heuristic fallback
  }
}
```

### Heuristic ile Hibrit Çalışma
```typescript
// fiyat-tahmin.ts'e ekle
// ML modeli varsa triangulation: 60% ML + 40% heuristic
const mlSonuc = await mlTahmin(env, features);
if (mlSonuc) {
  beklenenPerM2 = Math.round(0.6 * mlSonuc.beklenenPerM2 + 0.4 * heuristicPerM2);
  baselineKaynak = "ml-model";
}
```

**Dosyalar:**
- `scripts/ml-veri-hazirla.mjs` (yeni — D1'den CSV çek)
- `scripts/ml-egit.py` (yeni — Python, lokal çalışır)
- `backend/api/src/lib/ml-model.ts` (yeni)
- `backend/api/src/routes/fiyat.ts` (güncelle — ML çağrısı)
- `backend/api/wrangler.toml` (AI binding ekle)

**Efor:** 3-4 hafta | **Etki:** En yüksek uzun vadeli etki

---

## Özellik 5 — Parsel Değişiklik Takibi (Alert Engine)

### Ne
Favori parsellerde otomatik değişiklik tespiti:
- İmar değişikliği (e-Plan — kısmen var)
- Parsel bölünme/birleşme (TKGM polygon diff)
- Tapu tescil (e-Devlet/resmi gazete)
- Fiyat trendi alarmı (bildirim cron var)

### Eksik: Polygon Diff
```typescript
// backend/api/src/routes/takip.ts (yeni)
// Haftalık: favori parsellerin TKGM polygon'larını snapshot al
// Değişim varsa: area diff > %5 → bölünme/birleşme tespiti

interface ParselSnapshot {
  parsel_key: string;
  alan_m2: number;
  polygon_hash: string;  // WKT polygon → SHA256
  cekilen: number;
}

// D1 migration:
// CREATE TABLE parsel_snapshots (
//   parsel_key TEXT, alan_m2 INTEGER, polygon_hash TEXT,
//   cekilen INTEGER DEFAULT (unixepoch()),
//   PRIMARY KEY (parsel_key, cekilen)
// );
```

### Cron Entegrasyonu
```
"0 5 * * 1"  → haftalık polygon kontrol (Pazartesi 05:00)
  → favori parselleri çek (max 200)
  → TKGM API'den polygon çek
  → son snapshot ile karşılaştır
  → fark varsa Chrome notification + D1 log
```

**Dosyalar:**
- `backend/api/src/db/0026_snapshots.sql` (yeni)
- `backend/api/src/routes/takip.ts` (yeni)
- `backend/api/src/index.ts` (haftalık cron ekle)
- `src/background/scheduler.ts` (haftalık alarm güncelle)

**Efor:** 1-2 hafta | **Etki:** Pro retansiyon

---

## Özellik 6 — Tapu Gerçek Satış Verisi

### Ne
İlan fiyatı değil gerçekleşen satış. Milli Emlak (kısmen var) + belediye ihaleleri.

### Kaynaklar ve Scraping Stratejisi
```
1. Milli Emlak (ihale.milliemlak.gov.tr)
   - scripts/milli-emlak-scraper.mjs kısmen var
   - Genişlet: 81 il → ihale sonuçları → D1
   - Format: ada/parsel/il/ilce/tarih/ihale_fiyati

2. Belediye İhale Sonuçları
   - ihale.gov.tr (Kamu İhale Kurumu) → gayrimenkul filtreliği
   - PDF parse → pdfjs-dist
   - 50+ büyük belediye

3. e-İcra (icra.adalet.gov.tr)
   - Mahkeme kararıyla satışlar → gerçek piyasa dip fiyatı
   - Henüz implement edilmemiş
```

### D1 Schema
```sql
-- 0027_gercek_satis.sql
CREATE TABLE IF NOT EXISTS gercek_satis (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kaynak      TEXT NOT NULL,   -- 'milli-emlak'|'belediye'|'icra'
  il_norm     TEXT,
  ilce_norm   TEXT,
  ada_no      TEXT,
  parsel_no   TEXT,
  alan_m2     INTEGER,
  satis_fiyati INTEGER,
  fiyat_per_m2 INTEGER GENERATED ALWAYS AS (
    CASE WHEN alan_m2 > 0 THEN satis_fiyati / alan_m2 ELSE NULL END
  ) STORED,
  satis_tarihi INTEGER,
  ihale_no    TEXT,
  kaynak_url  TEXT,
  eklendi     INTEGER DEFAULT (unixepoch())
);
CREATE INDEX idx_gercek_satis_ilce ON gercek_satis(il_norm, ilce_norm);
```

### Fiyat Motoruna Entegrasyon
```typescript
// Mevcut milliEmlakOzet cross-validation'ı genişlet
// gercek_satis → ağırlıklı ortalama (son 12 ay, %30 ağırlık)
// ilan_fiyati → %70 ağırlık (alıcı-satıcı fark beklenior)
```

**Efor:** 3-5 hafta | **Etki:** Değerleme doğruluğu +

---

## Zaman Çizelgesi

```
Ay 1:
  Hafta 1-2:  Özellik 1 (Cadex) + Özellik 2 (API v2 temel)
  Hafta 3-4:  Özellik 3 (Computer Vision) + Özellik 5 (Takip)

Ay 2:
  Hafta 1-2:  Özellik 2 (API v2 batch + webhook)
  Hafta 3-4:  ML veri hazırlığı + model eğitimi (lokal)

Ay 3:
  Hafta 1-2:  Özellik 4 (ML model Workers AI deploy)
  Hafta 3-4:  Özellik 6 (Tapu scraping) + entegrasyon

Ay 4+:
  A/B test: ML model vs heuristic (MAPE karşılaştırma)
  Gerçek satış verisi birikimi
  Kurumsal pilot müşteriler
```

---

## Bağımlılık Grafiği

```
Özellik 1 (Cadex) ──── bağımsız, hemen başla
Özellik 2 (API v2) ─── Cadex'ten bağımsız, hemen başla
Özellik 3 (Vision) ─── uydu.ts mevcut, hemen başla
Özellik 5 (Takip) ──── bildirim altyapısı mevcut, 1 hafta
Özellik 4 (ML) ──────── D1 veri birikimi gerekli (en az 200k ilan)
Özellik 6 (Tapu) ────── bağımsız scraping, ML'e veri sağlar
```

---

## Yeni Dosya Listesi

```
backend/api/src/db/
  0024_endeks.sql       ← Cadex
  0025_api_v2.sql       ← Kurumsal API
  0026_snapshots.sql    ← Takip
  0027_gercek_satis.sql ← Tapu

backend/api/src/routes/
  api-v2.ts             ← Kurumsal API
  takip.ts              ← Değişiklik takibi

backend/api/src/lib/
  ml-model.ts           ← ML inference

scripts/
  ml-veri-hazirla.mjs   ← ML veri pipeline
  ml-egit.py            ← Python model eğitimi
  belediye-ihale.mjs    ← Tapu scraping

src/lib/
  vision-analiz.ts      ← CV tipleri
```

---

## Teknik Riskler

| Risk | Özellik | Azaltma |
|------|---------|---------|
| Workers AI ONNX beta | ML Model | Groq fallback (heuristic devam eder) |
| Sentinel Hub kota | Computer Vision | Google Maps Static API alternatif |
| Milli Emlak yapı değişikliği | Tapu | Graceful degradation, cache |
| D1 10M satır limiti | Tüm | Eski ilanları archive (zaten var) |
| Workers CPU 30s | Batch API | ctx.waitUntil + job queue |
