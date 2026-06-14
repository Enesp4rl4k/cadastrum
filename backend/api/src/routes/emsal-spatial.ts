/**
 * Spatial emsal endpoint — Faz 2 Sprint C.
 *
 * GET  /v1/emsal/spatial?lat=&lng=&radius_km=&kategori=
 *      → Cloudflare D1 ilanlar tablosunda bbox prefilter + haversine sıralama,
 *        cross-user anonim havuz. Cache-Control: public, s-maxage=300 (CDN 5dk).
 *
 * POST /v1/emsal/gonder
 *      → Opt-in: extension'dan tek bir emsal (lat/lng quantize) gönderir.
 *        Mevcut /v1/ilan endpoint'iyle çakışmaz; gönder daha hafif (auth yok,
 *        sadece koordlu kayıt kabul eder, kişisel meta yok).
 *
 * POST /v1/emsal/:id/dogrula
 *      → Kullanıcı bir emsali "gerçekçi" işaretler. guven_skoru artar,
 *        ileride spatial motor ağırlığına etkir.
 */
import { Hono } from "hono";
import type { Env } from "../index.js";

export const emsalSpatialRoutes = new Hono<{ Bindings: Env }>();

const VALID_KATEGORI = new Set(["arsa", "tarla", "konut", "bahce", "bag", "zeytinlik"]);
const MAX_RADIUS_KM = 15;
const MAX_RESULT = 500;

interface IlanRow {
  id: number;
  kaynak: string;
  fiyat_per_m2: number;
  m2: number | null;
  kategori: string;
  lat: number;
  lng: number;
  yakalanma_tarihi: number;
  ilan_tarihi: number | null;
  dogrulama_sayisi?: number;
  guven_skoru?: number;
}

/** Haversine — Cloudflare Worker'da kullanılan, app-layer kesin filtre için. */
function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function quantize3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function turkiyeBboxIcinde(lat: number, lng: number): boolean {
  return lat > 35 && lat < 43 && lng > 25 && lng < 46;
}

// ── GET /spatial ────────────────────────────────────────────────────────────
emsalSpatialRoutes.get("/spatial", async (c) => {
  const lat = parseFloat(c.req.query("lat") ?? "");
  const lng = parseFloat(c.req.query("lng") ?? "");
  const radiusKm = parseFloat(c.req.query("radius_km") ?? "5");
  const kategori = c.req.query("kategori") ?? "arsa";

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !turkiyeBboxIcinde(lat, lng)) {
    return c.json({ error: "Geçersiz lat/lng (Türkiye bbox dışı)" }, 400);
  }
  if (!Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > MAX_RADIUS_KM) {
    return c.json({ error: `radius_km 0-${MAX_RADIUS_KM} aralığında olmalı` }, 400);
  }
  if (!VALID_KATEGORI.has(kategori)) {
    return c.json({ error: "Geçersiz kategori" }, 400);
  }

  // Bbox prefilter — D1 index'i (kategori, lat, lng) kullanır
  const latDelta = radiusKm / 111;
  const lngDelta = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));
  const minLat = lat - latDelta;
  const maxLat = lat + latDelta;
  const minLng = lng - lngDelta;
  const maxLng = lng + lngDelta;

  // Aktif + son 365 gün + koordlu
  const yasEsigi = Date.now() - 365 * 86_400_000;
  const rows = await c.env.DB.prepare(
    `SELECT id, kaynak, fiyat_per_m2, m2, kategori, lat, lng, yakalanma_tarihi, ilan_tarihi,
            COALESCE(dogrulama_sayisi, 0) as dogrulama_sayisi,
            COALESCE(guven_skoru, 0.5) as guven_skoru
     FROM ilanlar
     WHERE kategori = ?
       AND aktif = 1
       AND lat IS NOT NULL AND lng IS NOT NULL
       AND lat BETWEEN ? AND ?
       AND lng BETWEEN ? AND ?
       AND yakalanma_tarihi >= ?
     LIMIT 1000`,
  ).bind(kategori, minLat, maxLat, minLng, maxLng, yasEsigi).all<IlanRow>();

  // App-layer kesin haversine + mesafe sıralama
  const radiusM = radiusKm * 1000;
  const emsaller = (rows.results ?? [])
    .map((r) => ({ ...r, mesafeM: haversineM(lat, lng, r.lat, r.lng) }))
    .filter((r) => r.mesafeM <= radiusM)
    .sort((a, b) => a.mesafeM - b.mesafeM)
    .slice(0, MAX_RESULT);

  // Halka dağılımı + weighted median (basit: w = exp(-d/D))
  const D = kategori === "konut" ? 2000 : kategori === "tarla" ? 8000 : 5000;
  const halka = { r0_1km: 0, r1_3km: 0, r3_5km: 0, r5_10km: 0 };
  for (const e of emsaller) {
    if (e.mesafeM <= 1000) halka.r0_1km++;
    else if (e.mesafeM <= 3000) halka.r1_3km++;
    else if (e.mesafeM <= 5000) halka.r3_5km++;
    else if (e.mesafeM <= 10_000) halka.r5_10km++;
  }
  const weighted = emsaller.map((e) => ({
    fiyat: e.fiyat_per_m2,
    weight: Math.exp(-e.mesafeM / D) * (e.guven_skoru ?? 0.5),
  }));
  const baseline = weightedMedian(weighted);

  c.header("Cache-Control", "public, s-maxage=300"); // 5dk CDN cache
  return c.json({
    emsaller,
    halkaDagilimi: halka,
    baseline,
    adet: emsaller.length,
    D,
    radiusM,
  });
});

function weightedMedian(items: Array<{ fiyat: number; weight: number }>): number | null {
  if (items.length === 0) return null;
  const sorted = [...items].sort((a, b) => a.fiyat - b.fiyat);
  const total = sorted.reduce((s, i) => s + i.weight, 0);
  if (total <= 0) return sorted[Math.floor(sorted.length / 2)]!.fiyat;
  let acc = 0;
  for (const it of sorted) {
    acc += it.weight;
    if (acc >= total / 2) return Math.round(it.fiyat);
  }
  return Math.round(sorted[sorted.length - 1]!.fiyat);
}

// ── POST /gonder ─────────────────────────────────────────────────────────────
interface EmsalGonderInput {
  lat?: number;
  lng?: number;
  fiyat_per_m2?: number;
  m2?: number;
  kategori?: string;
  ilan_tarihi?: number;
}

emsalSpatialRoutes.post("/gonder", async (c) => {
  const body = await c.req.json<EmsalGonderInput>().catch(() => null);
  if (!body) return c.json({ error: "Geçersiz JSON" }, 400);
  const { lat, lng, fiyat_per_m2, m2, kategori, ilan_tarihi } = body;

  if (typeof lat !== "number" || typeof lng !== "number" || !turkiyeBboxIcinde(lat, lng)) {
    return c.json({ error: "Geçersiz lat/lng" }, 422);
  }
  if (typeof fiyat_per_m2 !== "number" || fiyat_per_m2 <= 0 || fiyat_per_m2 > 10_000_000) {
    return c.json({ error: "Geçersiz fiyat_per_m2" }, 422);
  }
  if (!kategori || !VALID_KATEGORI.has(kategori)) {
    return c.json({ error: "Geçersiz kategori" }, 422);
  }

  // K-anonymity: 3 ondalık (~110m kare)
  const qLat = quantize3(lat);
  const qLng = quantize3(lng);
  // Dedup hash — aynı 110m kare + kategori + fiyat ± %3 ise tek kayıt
  const dedupKey = `spt_${qLat}_${qLng}_${kategori}_${Math.round(fiyat_per_m2 / 100) * 100}`;

  try {
    await c.env.DB.prepare(
      `INSERT OR IGNORE INTO ilanlar (
        kaynak, ilan_no, il_norm, ilce_norm, fiyat_per_m2, m2, kategori,
        para_birimi, ilan_tarihi, yakalanma_tarihi, lat, lng, koord_kaynagi
      ) VALUES ('extension', ?, '_', '_', ?, ?, ?, 'TL', ?, ?, ?, ?, 'manuel')`,
    ).bind(
      dedupKey,
      fiyat_per_m2,
      m2 ?? null,
      kategori,
      ilan_tarihi ?? null,
      Date.now(),
      qLat,
      qLng,
    ).run();
    return c.json({ ok: true }, 201);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return c.json({ error: msg }, 500);
  }
});

// ── POST /:id/dogrula ────────────────────────────────────────────────────────
emsalSpatialRoutes.post("/:id/dogrula", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  if (!Number.isFinite(id) || id <= 0) return c.json({ error: "Geçersiz id" }, 400);
  try {
    await c.env.DB.prepare(
      `UPDATE ilanlar
       SET dogrulama_sayisi = COALESCE(dogrulama_sayisi, 0) + 1,
           guven_skoru = MIN(1.0, COALESCE(guven_skoru, 0.5) + 0.1)
       WHERE id = ?`,
    ).bind(id).run();
    return c.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return c.json({ error: msg }, 500);
  }
});
