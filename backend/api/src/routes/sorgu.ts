/**
 * Web App sorgu endpoint — Faz 4 Sprint F MVP.
 *
 * POST /v1/sorgu
 *   body: { lat, lng }
 *   → en yakın mahalle istatistiğinden fiyat tahmini + Faz 2 spatial baseline
 *
 * Extension içermeyen kullanıcılar için: site/sorgu sayfasından çağrılır.
 * Mevcut /v1/fiyat/mahalle ve /v1/emsal/spatial endpoint'lerini birleştirir.
 *
 * Rate limiting: per IP 20 req/saat (Free tier); JWT varsa kullanıcı tier'ına
 * göre yüksek limit.
 */
import { Hono } from "hono";
import type { Env } from "../index.js";
import { haversineM, turkiyeBboxIcinde, kmToDegrees } from "../lib/geo.js";
import { rateLimitMiddleware } from "../lib/rate-limit.js";

export const sorguRoutes = new Hono<{ Bindings: Env }>();

interface SorguInput {
  lat?: number;
  lng?: number;
  kategori?: string;
  m2?: number; // Parsel alanı — toplam TL hesaplama için
}

const VALID_KATEGORI = new Set(["arsa", "tarla", "konut"]);

// Fallback il-bazlı baseline (TL/m²) — spatial + mahalle istatistik boşsa.
// Son güncelleme: Temmuz 2026 — yüksek enflasyon ortamında sık güncellenmeli.
// Kaynak: Endeksa, Hepsiemlak, REIDIN Temmuz 2026 ortalamaları.
const IL_FALLBACK_TL_M2: Record<string, { arsa: number; tarla: number; konut: number }> = {
  istanbul: { arsa: 85000,  tarla: 3000,  konut: 200000 },
  ankara:   { arsa: 28000,  tarla: 1500,  konut: 80000  },
  izmir:    { arsa: 55000,  tarla: 2000,  konut: 140000 },
  bursa:    { arsa: 25000,  tarla: 1200,  konut: 70000  },
  antalya:  { arsa: 45000,  tarla: 1800,  konut: 120000 },
  kocaeli:  { arsa: 22000,  tarla: 1000,  konut: 60000  },
  mugla:    { arsa: 60000,  tarla: 2500,  konut: 150000 },
  aydin:    { arsa: 30000,  tarla: 1200,  konut: 80000  },
  default:  { arsa: 15000,  tarla: 700,   konut: 40000  },
};

function ilFallbackBul(lat: number, lng: number, kategori: string): number {
  // Çok kaba bbox eşleştirmesi
  const tier1 = IL_FALLBACK_TL_M2.default;
  if (lat > 40.8 && lat < 41.4 && lng > 28.5 && lng < 29.5) return IL_FALLBACK_TL_M2.istanbul[kategori as "arsa"] ?? tier1.arsa;
  if (lat > 39.7 && lat < 40.1 && lng > 32.5 && lng < 33.1) return IL_FALLBACK_TL_M2.ankara[kategori as "arsa"] ?? tier1.arsa;
  if (lat > 38.2 && lat < 38.5 && lng > 26.9 && lng < 27.3) return IL_FALLBACK_TL_M2.izmir[kategori as "arsa"] ?? tier1.arsa;
  if (lat > 36.7 && lat < 37.0 && lng > 30.5 && lng < 30.9) return IL_FALLBACK_TL_M2.antalya[kategori as "arsa"] ?? tier1.arsa;
  return tier1[kategori as "arsa"] ?? tier1.arsa;
}

import { CoordinatesSchema, validateBody } from "../lib/validation.js";

// Merkezi rate-limit middleware — sorgu POST için 20 req/saat.
// Free tier web app sorguları; index.ts'deki /v1/sorgu/* global 100/saat üst limiti ile birlikte çalışır.
sorguRoutes.post("/", rateLimitMiddleware(20, "sorgu-web"), async (c) => {
  const { data: body, errorResponse } = await validateBody(CoordinatesSchema.extend({
    m2: CoordinatesSchema.shape.radiusKm.optional().nullable(),
  }), c);

  if (errorResponse || !body) {
    return errorResponse!;
  }

  const kategori = body.kategori ?? "arsa";
  const parselM2 = typeof body.m2 === "number" && body.m2 > 0 && body.m2 < 10_000_000 ? body.m2 : null;

  // Spatial sorgu — adaptif radius (5 → 10 → 20 km) emsal sayısına göre
  const yasEsigi = Date.now() - 365 * 86_400_000;
  interface EmsalRow {
    fiyat_per_m2: number;
    mesafeM: number;
    m2: number | null;
    mahalle_norm: string | null;
    imar_durumu: string | null;
    yakalanma_tarihi: number;
  }
  let filtered: EmsalRow[] = [];
  let radiusKm = 0;

  for (const r of [5, 10, 20]) {
    radiusKm = r;
    const { latDelta, lngDelta } = kmToDegrees(r, body.lat!);
    const rows = await c.env.DB.prepare(
      `SELECT fiyat_per_m2, lat, lng, m2, mahalle_norm, imar_durumu, yakalanma_tarihi
       FROM ilanlar
       WHERE kategori = ? AND aktif = 1
         AND lat IS NOT NULL AND lng IS NOT NULL
         AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?
         AND yakalanma_tarihi >= ?
       LIMIT 1000`,
    ).bind(kategori, body.lat - latDelta, body.lat + latDelta, body.lng - lngDelta, body.lng + lngDelta, yasEsigi)
      .all<{ fiyat_per_m2: number; lat: number; lng: number; m2: number | null; mahalle_norm: string | null; imar_durumu: string | null; yakalanma_tarihi: number }>();

    const radiusM = r * 1000;
    filtered = (rows.results ?? [])
      .map((row) => ({
        fiyat_per_m2: row.fiyat_per_m2,
        mesafeM: haversineM(body.lat!, body.lng!, row.lat, row.lng),
        m2: row.m2,
        mahalle_norm: row.mahalle_norm,
        imar_durumu: row.imar_durumu,
        yakalanma_tarihi: row.yakalanma_tarihi,
      }))
      .filter((row) => row.mesafeM <= radiusM)
      .sort((a, b) => a.mesafeM - b.mesafeM);
    if (filtered.length >= 5) break;
  }

  // CMA — en yakın 8 emsal (karşılaştırmalı piyasa analizi için)
  const emsaller = filtered.slice(0, 8).map((e) => ({
    fiyat_per_m2: Math.round(e.fiyat_per_m2),
    m2: e.m2,
    mahalle: e.mahalle_norm,
    imar: e.imar_durumu,
    mesafe_m: Math.round(e.mesafeM),
    yas_gun: Math.round((Date.now() - e.yakalanma_tarihi) / 86_400_000),
  }));

  // Weighted median + Q1/Q3 (distance decay D=radius)
  const D = radiusKm * 1000;
  const weighted = filtered.map((e) => ({
    fiyat: e.fiyat_per_m2,
    weight: Math.exp(-e.mesafeM / D),
  }));
  weighted.sort((a, b) => a.fiyat - b.fiyat);
  const totalWeight = weighted.reduce((s, w) => s + w.weight, 0);

  function quantile(p: number): number | null {
    if (totalWeight <= 0) return null;
    let acc = 0;
    for (const it of weighted) {
      acc += it.weight;
      if (acc >= totalWeight * p) return Math.round(it.fiyat);
    }
    return weighted.length > 0 ? Math.round(weighted[weighted.length - 1]!.fiyat) : null;
  }

  let medyan = quantile(0.5);
  let alt = quantile(0.25);
  let ust = quantile(0.75);
  let kaynak: "spatial-radius" | "mahalle-istatistik" | "il-fallback" = "spatial-radius";

  // Fallback 1: spatial yetersiz → en yakın ilan'dan mahalle bul, mahalle_istatistik'e bak
  if (medyan == null || filtered.length < 5) {
    const enYakin = await c.env.DB.prepare(
      `SELECT il_norm, ilce_norm, mahalle_norm,
              ((lat - ?) * (lat - ?) + (lng - ?) * (lng - ?)) AS d2
       FROM ilanlar
       WHERE lat IS NOT NULL AND lng IS NOT NULL AND mahalle_norm IS NOT NULL
       ORDER BY d2 ASC LIMIT 1`,
    ).bind(body.lat, body.lat, body.lng, body.lng).first<{ il_norm: string; ilce_norm: string; mahalle_norm: string }>();

    if (enYakin) {
      const ist = await c.env.DB.prepare(
        `SELECT medyan, q1, q3, ortalama, ilan_adet FROM mahalle_istatistik
         WHERE il_norm = ? AND ilce_norm = ? AND mahalle_norm = ? AND kategori = ?`,
      ).bind(enYakin.il_norm, enYakin.ilce_norm, enYakin.mahalle_norm, kategori)
        .first<{ medyan: number; q1: number; q3: number; ortalama: number; ilan_adet: number }>();

      if (ist && ist.medyan > 0) {
        medyan = Math.round(ist.medyan);
        alt = ist.q1 ? Math.round(ist.q1) : Math.round(medyan * 0.8);
        ust = ist.q3 ? Math.round(ist.q3) : Math.round(medyan * 1.25);
        kaynak = "mahalle-istatistik";
      }
    }
  }

  // Fallback 2: il-bazlı kaba baseline (her zaman bir cevap döner)
  if (medyan == null) {
    medyan = ilFallbackBul(body.lat, body.lng, kategori);
    alt = Math.round(medyan * 0.7);
    ust = Math.round(medyan * 1.4);
    kaynak = "il-fallback";
  }

  // Güven skoru (0–100) — kaynak + emsal sayısı + dağılım darlığı
  let guven = 0;
  if (kaynak === "spatial-radius") {
    guven = Math.min(95, 50 + filtered.length * 3 + (radiusKm === 5 ? 15 : radiusKm === 10 ? 5 : 0));
  } else if (kaynak === "mahalle-istatistik") {
    guven = 65;
  } else {
    guven = 30;
  }

  // Toplam TL (parsel m² verilmişse)
  const toplam = parselM2 != null && medyan != null ? {
    alt: Math.round((alt ?? medyan) * parselM2),
    orta: Math.round(medyan * parselM2),
    ust: Math.round((ust ?? medyan) * parselM2),
  } : null;

  c.header("Cache-Control", "public, s-maxage=300");
  return c.json({
    ok: true,
    kaynak,
    guven_skoru: guven,
    lat: body.lat,
    lng: body.lng,
    kategori,
    m2: parselM2,
    radius_km: radiusKm,
    emsal_adet: filtered.length,
    medyan_tlm2: medyan,
    alt_tlm2: alt,
    ust_tlm2: ust,
    toplam_tl: toplam,
    emsaller,
    halka_dagilimi: {
      r0_1km: filtered.filter((f) => f.mesafeM <= 1000).length,
      r1_3km: filtered.filter((f) => f.mesafeM > 1000 && f.mesafeM <= 3000).length,
      r3_5km: filtered.filter((f) => f.mesafeM > 3000 && f.mesafeM <= 5000).length,
    },
    kalan_kota: 0, // rate limit artık middleware header'larında (X-RateLimit-Remaining)
  });
});

/**
 * GET /v1/trend?lat=&lng=&kategori=&ay=12
 * Bölgenin son N aylık medyan ₺/m² zaman serisi — fiyat trendi grafiği için.
 * 10 km radius içindeki ilanları aya göre gruplar, her ay için medyan döndürür.
 */
sorguRoutes.get("/trend", async (c) => {
  const lat = parseFloat(c.req.query("lat") ?? "");
  const lng = parseFloat(c.req.query("lng") ?? "");
  const kategoriQ = c.req.query("kategori");
  const kategori = kategoriQ && VALID_KATEGORI.has(kategoriQ) ? kategoriQ : "arsa";
  const ay = Math.min(Math.max(parseInt(c.req.query("ay") ?? "12", 10) || 12, 3), 24);

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !turkiyeBboxIcinde(lat, lng)) {
    return c.json({ error: "Geçersiz lat/lng" }, 400);
  }

  const radiusKm = 10;
  const { latDelta, lngDelta } = kmToDegrees(radiusKm, lat);
  const yasEsigi = Date.now() - ay * 30 * 86_400_000;

  const rows = await c.env.DB.prepare(
    `SELECT fiyat_per_m2, yakalanma_tarihi
     FROM ilanlar
     WHERE kategori = ? AND aktif = 1
       AND lat IS NOT NULL AND lng IS NOT NULL
       AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?
       AND yakalanma_tarihi >= ?
     LIMIT 5000`,
  ).bind(kategori, lat - latDelta, lat + latDelta, lng - lngDelta, lng + lngDelta, yasEsigi)
    .all<{ fiyat_per_m2: number; yakalanma_tarihi: number }>();

  // Aya göre grupla (YYYY-MM)
  const gruplar = new Map<string, number[]>();
  for (const row of rows.results ?? []) {
    const d = new Date(row.yakalanma_tarihi);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    if (!gruplar.has(key)) gruplar.set(key, []);
    gruplar.get(key)!.push(row.fiyat_per_m2);
  }

  const noktalar = [...gruplar.entries()]
    .map(([ay, fiyatlar]) => {
      fiyatlar.sort((a, b) => a - b);
      const medyan = fiyatlar[Math.floor(fiyatlar.length / 2)]!;
      return { ay, medyan: Math.round(medyan), adet: fiyatlar.length };
    })
    .sort((a, b) => a.ay.localeCompare(b.ay));

  // Trend yön + yüzde değişim (ilk vs son)
  let degisimYuzde: number | null = null;
  if (noktalar.length >= 2) {
    const ilk = noktalar[0]!.medyan;
    const son = noktalar[noktalar.length - 1]!.medyan;
    if (ilk > 0) degisimYuzde = Math.round(((son - ilk) / ilk) * 1000) / 10;
  }

  c.header("Cache-Control", "public, s-maxage=600");
  return c.json({
    ok: true,
    kategori,
    ay_sayisi: ay,
    nokta_adet: noktalar.length,
    degisim_yuzde: degisimYuzde,
    noktalar,
  });
});
