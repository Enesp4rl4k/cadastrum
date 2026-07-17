/**
 * Spatial emsal endpoint — Faz 2 Sprint C + IDW AVM.
 *
 * GET  /v1/emsal/spatial?lat=&lng=&radius_km=&kategori=&mode=
 *      → mode=weighted_median (default): exp(-d/D) weighted median
 *      → mode=idw: Inverse Distance Weighting (p=2) + çarpan zinciri
 *        (eğim, PGA, enflasyon yaş düzeltmesi, yol yakınlığı)
 *
 * POST /v1/emsal/gonder
 *      → Opt-in: extension'dan tek bir emsal (lat/lng quantize) gönderir.
 *
 * POST /v1/emsal/:id/dogrula
 *      → Kullanıcı bir emsali "gerçekçi" işaretler. guven_skoru artar.
 */
import { Hono } from "hono";
import type { Env } from "../index.js";

export const emsalSpatialRoutes = new Hono<{ Bindings: Env }>();

const VALID_KATEGORI = new Set(["arsa", "tarla", "konut", "bahce", "bag", "zeytinlik"]);
const MAX_RADIUS_KM = 20;
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

// ── IDW + Çarpan Zinciri Yardımcıları ────────────────────────────────────────

/**
 * Inverse Distance Weighting (p=2).
 * w_i = 1 / d_i^p   →  fiyat_idw = Σ(w_i × fiyat_i) / Σ(w_i)
 * d=0 için exact match (o noktanın fiyatı direkt döner).
 */
function idwHesapla(
  items: Array<{ fiyat: number; mesafeM: number }>,
  p = 2,
): number | null {
  if (items.length === 0) return null;
  const eps = 1; // metre — sıfır mesafe koruması
  let sumW = 0, sumWF = 0;
  for (const it of items) {
    const d = Math.max(it.mesafeM, eps);
    const w = 1 / Math.pow(d, p);
    sumW += w;
    sumWF += w * it.fiyat;
  }
  return sumW > 0 ? Math.round(sumWF / sumW) : null;
}

/**
 * Enflasyon yaş düzeltmesi — TR TÜFE yaklaşımı.
 * Aylık ~%3 endeks artışı (yıllık ~%40 enflasyon baz alınarak).
 * 30 günden taze: düzeltme yok. Her 30 gün için ×1.03.
 * Max 12 ay geriye (üzeri çok eski, havuzdan zaten atılmış).
 */
function enflasyonDuzeltCarpani(yakalanmaTarihi: number): number {
  const gunFarki = (Date.now() - yakalanmaTarihi) / 86_400_000;
  if (gunFarki <= 30) return 1.0;
  const ayFarki = Math.min(Math.floor(gunFarki / 30), 12);
  return Math.pow(1.03, ayFarki);
}

/**
 * Eğim çarpanı — eğim yüzdesi bilinmiyorsa 1.0 (nötr).
 * Değerler fiyat-tahmin.ts'deki egimCarpani ile tutarlı.
 */
function egimCarpaniIDW(egimYuzde: number | null): { carpan: number; not: string } {
  if (egimYuzde === null) return { carpan: 1.0, not: "eğim bilinmiyor" };
  if (egimYuzde < 2)  return { carpan: 1.05, not: `düz (${egimYuzde.toFixed(1)}%), +%5` };
  if (egimYuzde < 5)  return { carpan: 1.0,  not: `hafif eğim (${egimYuzde.toFixed(1)}%)` };
  if (egimYuzde < 15) return { carpan: 0.92, not: `orta eğim (${egimYuzde.toFixed(1)}%), -%8` };
  if (egimYuzde < 30) return { carpan: 0.78, not: `dik (${egimYuzde.toFixed(1)}%), -%22` };
  return { carpan: 0.55, not: `çok dik (${egimYuzde.toFixed(1)}%), -%45` };
}

/**
 * PGA (Peak Ground Acceleration) deprem çarpanı.
 * Değerler fiyat-tahmin.ts::pgaCarpani ile senkronize.
 */
function pgaCarpaniIDW(pga: number | null): { carpan: number; not: string } {
  if (pga === null || pga <= 0) return { carpan: 1.0, not: "deprem verisi yok" };
  if (pga < 0.1)  return { carpan: 1.04, not: `düşük sismik risk (PGA ${pga.toFixed(2)}g)` };
  if (pga < 0.2)  return { carpan: 1.0,  not: `orta sismik risk (PGA ${pga.toFixed(2)}g)` };
  if (pga < 0.3)  return { carpan: 0.97, not: `yüksek sismik risk (PGA ${pga.toFixed(2)}g), -%3` };
  if (pga < 0.4)  return { carpan: 0.94, not: `çok yüksek sismik risk (PGA ${pga.toFixed(2)}g), -%6` };
  return { carpan: 0.88, not: `kritik sismik bölge (PGA ${pga.toFixed(2)}g), -%12` };
}

/**
 * Otoyol yakınlığı çarpanı.
 * < 2km premium, > 20km iskonto.
 */
function yolCarpaniIDW(otoyolKm: number | null): { carpan: number; not: string } {
  if (otoyolKm === null) return { carpan: 1.0, not: "yol mesafesi bilinmiyor" };
  if (otoyolKm < 2)  return { carpan: 1.05, not: `otoyola yakın (${otoyolKm.toFixed(1)}km), +%5` };
  if (otoyolKm < 10) return { carpan: 1.0,  not: `otoyola orta mesafe (${otoyolKm.toFixed(1)}km)` };
  if (otoyolKm < 20) return { carpan: 0.97, not: `otoyola uzak (${otoyolKm.toFixed(1)}km), -%3` };
  return { carpan: 0.95, not: `otoyoldan çok uzak (${otoyolKm.toFixed(1)}km), -%5` };
}

// ── GET /spatial ────────────────────────────────────────────────────────────
emsalSpatialRoutes.get("/spatial", async (c) => {
  const lat = parseFloat(c.req.query("lat") ?? "");
  const lng = parseFloat(c.req.query("lng") ?? "");
  const radiusKm = parseFloat(c.req.query("radius_km") ?? "5");
  const kategori = c.req.query("kategori") ?? "arsa";
  const mode = c.req.query("mode") ?? "weighted_median"; // "weighted_median" | "idw"
  // IDW ek parametreler (opsiyonel — bilinmiyorsa null çarpan)
  const egimYuzde = c.req.query("egim_yuzde") ? parseFloat(c.req.query("egim_yuzde")!) : null;
  const pga       = c.req.query("pga")         ? parseFloat(c.req.query("pga")!)         : null;
  const otoyolKm  = c.req.query("otoyol_km")   ? parseFloat(c.req.query("otoyol_km")!)   : null;

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !turkiyeBboxIcinde(lat, lng)) {
    return c.json({ error: "Geçersiz lat/lng (Türkiye bbox dışı)" }, 400);
  }
  if (!Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > MAX_RADIUS_KM) {
    return c.json({ error: `radius_km 0-${MAX_RADIUS_KM} aralığında olmalı` }, 400);
  }
  if (!VALID_KATEGORI.has(kategori)) {
    return c.json({ error: "Geçersiz kategori" }, 400);
  }
  if (mode !== "weighted_median" && mode !== "idw") {
    return c.json({ error: "mode: 'weighted_median' veya 'idw' olmalı" }, 400);
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

  // Halka dağılımı
  const D = kategori === "konut" ? 2000 : kategori === "tarla" ? 8000 : 5000;
  const halka = { r0_1km: 0, r1_3km: 0, r3_5km: 0, r5_10km: 0 };
  for (const e of emsaller) {
    if (e.mesafeM <= 1000) halka.r0_1km++;
    else if (e.mesafeM <= 3000) halka.r1_3km++;
    else if (e.mesafeM <= 5000) halka.r3_5km++;
    else if (e.mesafeM <= 10_000) halka.r5_10km++;
  }

  // ── Weighted Median (mevcut default) ──────────────────────────────────────
  const weighted = emsaller.map((e) => ({
    fiyat: e.fiyat_per_m2,
    weight: Math.exp(-e.mesafeM / D) * (e.guven_skoru ?? 0.5),
  }));
  const baseline = weightedMedian(weighted);

  // ── IDW AVM modu ──────────────────────────────────────────────────────────
  let idwSonuc: {
    idwFiyat: number | null;
    kalibreFiyat: number | null;
    carpanZinciri: Array<{ ad: string; carpan: number; not: string }>;
    guvenAraligi: { alt: number; ust: number } | null;
  } | null = null;

  if (mode === "idw" && emsaller.length > 0) {
    // Enflasyon düzeltmeli IDW — her emsalin fiyatı güncele çekilir
    const idwItems = emsaller.map((e) => ({
      fiyat: Math.round(e.fiyat_per_m2 * enflasyonDuzeltCarpani(e.yakalanma_tarihi)),
      mesafeM: e.mesafeM,
    }));

    const idwFiyat = idwHesapla(idwItems);

    // Çarpan zinciri
    const egimC = egimCarpaniIDW(egimYuzde);
    const pgaC  = pgaCarpaniIDW(pga);
    const yolC  = yolCarpaniIDW(otoyolKm);

    const carpanZinciri = [
      { ad: "IDW (p=2)", carpan: 1.0, not: `${emsaller.length} emsal, ${radiusKm}km yarıçap` },
      { ad: "Enflasyon düzeltmesi", carpan: 1.0, not: "Aylık TÜFE yaklaşımıyla güncel değere taşındı" },
      { ad: "Eğim", carpan: egimC.carpan, not: egimC.not },
      { ad: "Deprem riski (PGA)", carpan: pgaC.carpan, not: pgaC.not },
      { ad: "Yol/otoyol mesafesi", carpan: yolC.carpan, not: yolC.not },
    ].filter(c => c.carpan !== 1.0 || c.ad === "IDW (p=2)" || c.ad === "Enflasyon düzeltmesi");

    const totalCarpan = egimC.carpan * pgaC.carpan * yolC.carpan;
    const kalibreFiyat = idwFiyat ? Math.round(idwFiyat * totalCarpan) : null;

    // IQR tabanlı güven aralığı
    let guvenAraligi: { alt: number; ust: number } | null = null;
    if (kalibreFiyat && idwItems.length >= 4) {
      const sirali = [...idwItems.map(i => i.fiyat)].sort((a, b) => a - b);
      const q1idx = Math.floor(sirali.length * 0.25);
      const q3idx = Math.floor(sirali.length * 0.75);
      const q1 = sirali[q1idx] ?? sirali[0]!;
      const q3 = sirali[q3idx] ?? sirali[sirali.length - 1]!;
      const iqr = q3 - q1;
      guvenAraligi = {
        alt: Math.round((kalibreFiyat - iqr * 0.5) * totalCarpan),
        ust: Math.round((kalibreFiyat + iqr * 0.5) * totalCarpan),
      };
    }

    idwSonuc = { idwFiyat, kalibreFiyat, carpanZinciri, guvenAraligi };
  }

  c.header("Cache-Control", "public, s-maxage=300"); // 5dk CDN cache
  return c.json({
    emsaller,
    halkaDagilimi: halka,
    baseline,
    adet: emsaller.length,
    D,
    radiusM,
    ...(idwSonuc ? { idw: idwSonuc } : {}),
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
