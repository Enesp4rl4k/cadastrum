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
import { yatirimSkoruHesapla } from "../lib/yatirim-skoru.js";

export const sorguRoutes = new Hono<{ Bindings: Env }>();

interface SorguInput {
  lat?: number;
  lng?: number;
  kategori?: string;
  m2?: number;
  /** Lokasyon — Endeksa tarzı (lat/lng yoksa mahalle istatistiği) */
  il?: string;
  ilce?: string;
  mahalle?: string;
  /** İmar tipi: konut | ticari | sanayi | tarim | karma | belirsiz */
  imar_tipi?: string;
  /** Emsal / KAKS (örn. 1.50) */
  emsal?: number;
  /** TAKS (örn. 0.30) */
  taks?: number;
}

const VALID_KATEGORI = new Set(["arsa", "tarla", "konut"]);
const VALID_IMAR = new Set(["konut", "ticari", "sanayi", "tarim", "karma", "belirsiz"]);

/** Türkçe → ASCII slug (DB il_norm / ilce_norm ile uyumlu) */
function trNorm(s: string): string {
  return s
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/i̇/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "")
    .replace(/\s+/g, "");
}

/** İmar tipi → fiyat çarpanı (arsa baseline'a göre) */
function imarTipiCarpani(
  tip: string,
  kategori: string,
): { carpan: number; not: string } {
  const tarla = kategori === "tarla";
  switch (tip) {
    case "konut":
      return { carpan: tarla ? 3.2 : 1.18, not: "Konut imarı primi" };
    case "ticari":
      return { carpan: tarla ? 3.8 : 1.28, not: "Ticari imar primi" };
    case "sanayi":
      return { carpan: tarla ? 2.8 : 1.15, not: "Sanayi/depo imarı" };
    case "tarim":
      return { carpan: tarla ? 1.0 : 0.72, not: "Tarımsal kullanım indirimi" };
    case "karma":
      return { carpan: tarla ? 3.0 : 1.12, not: "Karma kullanım" };
    default:
      return { carpan: 1.0, not: "İmar tipi belirsiz — nötr" };
  }
}

/**
 * Emsal (KAKS) etkisi — referans 1.0.
 * Yüksek emsal = daha fazla inşa hakkı = daha yüksek arsa değeri.
 * Çarpan: clamp(0.75 + 0.25 * emsal, 0.7, 1.55)
 */
function emsalCarpani(emsal: number | null): { carpan: number; not: string } | null {
  if (emsal == null || !Number.isFinite(emsal) || emsal <= 0) return null;
  const carpan = Math.min(1.55, Math.max(0.7, 0.75 + 0.25 * emsal));
  return {
    carpan: Math.round(carpan * 1000) / 1000,
    not: `Emsal (KAKS) ${emsal.toFixed(2)} · referans 1.00'e göre ×${carpan.toFixed(2)}`,
  };
}

/** TAKS — yüksek taban oranı hafif pozitif (max +8%) */
function taksCarpani(taks: number | null): { carpan: number; not: string } | null {
  if (taks == null || !Number.isFinite(taks) || taks <= 0) return null;
  const t = Math.min(1, Math.max(0.05, taks));
  const carpan = Math.min(1.08, Math.max(0.95, 0.95 + t * 0.13));
  return {
    carpan: Math.round(carpan * 1000) / 1000,
    not: `TAKS ${t.toFixed(2)} · ×${carpan.toFixed(2)}`,
  };
}

// Fallback il-bazlı baseline (TL/m²) — spatial + mahalle istatistik boşsa.
// Kabaca İstanbul/Ankara/İzmir merkez ortalaması, diğer iller 1/4. Çok kaba
// ama "veri yok" demektense bir-aralık ver.
const IL_FALLBACK_TL_M2: Record<string, { arsa: number; tarla: number; konut: number }> = {
  istanbul: { arsa: 25000, tarla: 800, konut: 60000 },
  ankara: { arsa: 8000, tarla: 400, konut: 25000 },
  izmir: { arsa: 15000, tarla: 600, konut: 35000 },
  bursa: { arsa: 8000, tarla: 350, konut: 22000 },
  antalya: { arsa: 12000, tarla: 500, konut: 30000 },
  kocaeli: { arsa: 7000, tarla: 300, konut: 20000 },
  default: { arsa: 5000, tarla: 200, konut: 15000 },
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

function turkiyeBboxIcinde(lat: number, lng: number): boolean {
  return lat > 35 && lat < 43 && lng > 25 && lng < 46;
}

/** Haversine — spatial query için. */
function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function rateLimitWeb(env: Env, ip: string): Promise<{ ok: boolean; kalan: number }> {
  const limit = 20; // Web app daha düşük (extension'a göre daha pasif)
  const saat = Math.floor(Date.now() / 3600_000);
  const row = await env.DB.prepare(
    `SELECT istek_sayisi FROM rate_limit WHERE ip = ? AND saat = ?`,
  ).bind(`web_${ip}`, saat).first<{ istek_sayisi: number }>();
  const mevcut = row?.istek_sayisi ?? 0;
  if (mevcut >= limit) return { ok: false, kalan: 0 };
  await env.DB.prepare(
    `INSERT INTO rate_limit (ip, saat, istek_sayisi) VALUES (?, ?, 1)
     ON CONFLICT(ip, saat) DO UPDATE SET istek_sayisi = istek_sayisi + 1`,
  ).bind(`web_${ip}`, saat).run();
  return { ok: true, kalan: limit - mevcut - 1 };
}

sorguRoutes.post("/", async (c) => {
  const ip = c.req.header("CF-Connecting-IP") ?? c.req.header("X-Forwarded-For") ?? "unknown";
  const rate = await rateLimitWeb(c.env, ip);
  if (!rate.ok) return c.json({ error: "Rate limit (20/saat). Pro tier ile kalkar." }, 429);

  const body = await c.req.json<SorguInput>().catch(() => null);
  if (!body) return c.json({ error: "Geçersiz istek gövdesi" }, 400);

  const hasCoords =
    typeof body.lat === "number" &&
    typeof body.lng === "number" &&
    Number.isFinite(body.lat) &&
    Number.isFinite(body.lng);

  const ilNorm = body.il ? trNorm(body.il) : "";
  const ilceNorm = body.ilce ? trNorm(body.ilce) : "";
  const mahalleNorm = body.mahalle ? trNorm(body.mahalle) : "";
  const hasLokasyon = ilNorm.length > 0;

  if (!hasCoords && !hasLokasyon && !ilNorm) {
    return c.json({ error: "Lat/lng veya il (+ tercihen ilçe/mahalle) gerekli" }, 400);
  }
  if (hasCoords && !turkiyeBboxIcinde(body.lat!, body.lng!)) {
    return c.json({ error: "Koordinat Türkiye bbox dışı" }, 400);
  }

  const kategori = body.kategori && VALID_KATEGORI.has(body.kategori) ? body.kategori : "arsa";
  const parselM2 = typeof body.m2 === "number" && body.m2 > 0 && body.m2 < 10_000_000 ? body.m2 : null;
  const imarTipi =
    body.imar_tipi && VALID_IMAR.has(body.imar_tipi) ? body.imar_tipi : "belirsiz";
  const emsalVal =
    typeof body.emsal === "number" && body.emsal > 0 && body.emsal < 20 ? body.emsal : null;
  const taksVal =
    typeof body.taks === "number" && body.taks > 0 && body.taks <= 1 ? body.taks : null;

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
  let medyan: number | null = null;
  let alt: number | null = null;
  let ust: number | null = null;
  let kaynak: "spatial-radius" | "mahalle-istatistik" | "ilce-istatistik" | "il-fallback" = "il-fallback";
  let lokasyonEtiket: string | null = null;

  // ── A) Lokasyon öncelikli: mahalle → ilçe → il istatistik ──
  if (hasLokasyon) {
    lokasyonEtiket = [mahalleNorm, ilceNorm, ilNorm].filter(Boolean).join(" / ");

    if (mahalleNorm && ilceNorm) {
      const ist = await c.env.DB.prepare(
        `SELECT medyan, q1, q3, ilan_adet FROM mahalle_istatistik
         WHERE il_norm = ? AND ilce_norm = ? AND kategori = ?
           AND (mahalle_norm = ? OR replace(mahalle_norm, '-', '') = ? OR replace(mahalle_norm, ' ', '') = ?)
         LIMIT 1`,
      )
        .bind(ilNorm, ilceNorm, kategori, mahalleNorm, mahalleNorm, mahalleNorm)
        .first<{ medyan: number; q1: number; q3: number; ilan_adet: number }>();

      if (ist && ist.medyan > 0) {
        medyan = Math.round(ist.medyan);
        alt = ist.q1 ? Math.round(ist.q1) : Math.round(medyan * 0.8);
        ust = ist.q3 ? Math.round(ist.q3) : Math.round(medyan * 1.25);
        kaynak = "mahalle-istatistik";
      }
    }

    if (medyan == null && ilceNorm) {
      const ilceIst = await c.env.DB.prepare(
        `SELECT medyan, q1, q3, ilan_adet FROM ilce_istatistik
         WHERE il_norm = ? AND (ilce_norm = ? OR replace(ilce_norm, '-', '') = ?) AND kategori = ?
         LIMIT 1`,
      )
        .bind(ilNorm, ilceNorm, ilceNorm, kategori)
        .first<{ medyan: number; q1: number; q3: number; ilan_adet: number }>();

      if (ilceIst && ilceIst.medyan > 0) {
        medyan = Math.round(ilceIst.medyan);
        alt = ilceIst.q1 ? Math.round(ilceIst.q1) : Math.round(medyan * 0.8);
        ust = ilceIst.q3 ? Math.round(ilceIst.q3) : Math.round(medyan * 1.25);
        kaynak = "ilce-istatistik";
      }
    }

    // AI mahalle baseline
    if (medyan == null && mahalleNorm && ilceNorm) {
      const ai = await c.env.DB.prepare(
        `SELECT tlm2 AS medyan FROM mahalle_baseline_ai
         WHERE il_norm = ? AND ilce_norm = ? AND kategori = ?
           AND (mahalle_norm = ? OR replace(mahalle_norm, '-', '') = ?)
         LIMIT 1`,
      )
        .bind(ilNorm, ilceNorm, kategori, mahalleNorm, mahalleNorm)
        .first<{ medyan: number }>();
      if (ai && ai.medyan > 0) {
        medyan = Math.round(ai.medyan);
        alt = Math.round(medyan * 0.8);
        ust = Math.round(medyan * 1.25);
        kaynak = "mahalle-istatistik";
      }
    }

    if (medyan == null) {
      const ilIst = await c.env.DB.prepare(
        `SELECT medyan FROM il_istatistik WHERE il_norm = ? AND kategori = ?`,
      )
        .bind(ilNorm, kategori)
        .first<{ medyan: number }>();
      if (ilIst?.medyan && ilIst.medyan > 0) {
        medyan = Math.round(ilIst.medyan);
        alt = Math.round(medyan * 0.75);
        ust = Math.round(medyan * 1.3);
        kaynak = "il-fallback";
      }
    }
  }

  // ── B) Koordinat varsa spatial (lokasyon sonucu yoksa veya zenginleştirme) ──
  if (hasCoords && (medyan == null || filtered.length === 0)) {
    for (const r of [5, 10, 20]) {
      radiusKm = r;
      const latDelta = r / 111;
      const lngDelta = r / (111 * Math.cos((body.lat! * Math.PI) / 180));
      const rows = await c.env.DB.prepare(
        `SELECT fiyat_per_m2, lat, lng, m2, mahalle_norm, imar_durumu, yakalanma_tarihi
         FROM ilanlar
         WHERE kategori = ? AND aktif = 1
           AND lat IS NOT NULL AND lng IS NOT NULL
           AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?
           AND yakalanma_tarihi >= ?
         LIMIT 1000`,
      )
        .bind(
          kategori,
          body.lat! - latDelta,
          body.lat! + latDelta,
          body.lng! - lngDelta,
          body.lng! + lngDelta,
          yasEsigi,
        )
        .all<{
          fiyat_per_m2: number;
          lat: number;
          lng: number;
          m2: number | null;
          mahalle_norm: string | null;
          imar_durumu: string | null;
          yakalanma_tarihi: number;
        }>();

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

    if (medyan == null && filtered.length >= 5) {
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

      medyan = quantile(0.5);
      alt = quantile(0.25);
      ust = quantile(0.75);
      kaynak = "spatial-radius";
    } else if (medyan == null && hasCoords) {
      // Fallback mahalle from nearest listing
      const enYakin = await c.env.DB.prepare(
        `SELECT il_norm, ilce_norm, mahalle_norm,
                ((lat - ?) * (lat - ?) + (lng - ?) * (lng - ?)) AS d2
         FROM ilanlar
         WHERE lat IS NOT NULL AND lng IS NOT NULL AND mahalle_norm IS NOT NULL
         ORDER BY d2 ASC LIMIT 1`,
      )
        .bind(body.lat, body.lat, body.lng, body.lng)
        .first<{ il_norm: string; ilce_norm: string; mahalle_norm: string }>();

      if (enYakin) {
        const ist = await c.env.DB.prepare(
          `SELECT medyan, q1, q3 FROM mahalle_istatistik
           WHERE il_norm = ? AND ilce_norm = ? AND mahalle_norm = ? AND kategori = ?`,
        )
          .bind(enYakin.il_norm, enYakin.ilce_norm, enYakin.mahalle_norm, kategori)
          .first<{ medyan: number; q1: number; q3: number }>();

        if (ist && ist.medyan > 0) {
          medyan = Math.round(ist.medyan);
          alt = ist.q1 ? Math.round(ist.q1) : Math.round(medyan * 0.8);
          ust = ist.q3 ? Math.round(ist.q3) : Math.round(medyan * 1.25);
          kaynak = "mahalle-istatistik";
          lokasyonEtiket = `${enYakin.mahalle_norm} / ${enYakin.ilce_norm} / ${enYakin.il_norm}`;
        }
      }
    }
  }

  // ── C) İl fallback ──
  if (medyan == null) {
    if (hasCoords) {
      medyan = ilFallbackBul(body.lat!, body.lng!, kategori);
    } else {
      const ilIst = await c.env.DB.prepare(
        `SELECT medyan FROM il_istatistik WHERE il_norm = ? AND kategori = ?`,
      )
        .bind(ilNorm, kategori)
        .first<{ medyan: number }>();
      medyan = ilIst?.medyan && ilIst.medyan > 0
        ? Math.round(ilIst.medyan)
        : (IL_FALLBACK_TL_M2[ilNorm]?.[kategori as "arsa"] ?? IL_FALLBACK_TL_M2.default.arsa);
    }
    alt = Math.round(medyan * 0.7);
    ust = Math.round(medyan * 1.4);
    kaynak = "il-fallback";
  }

  // CMA — en yakın 8 emsal
  const emsaller = filtered.slice(0, 8).map((e) => ({
    fiyat_per_m2: Math.round(e.fiyat_per_m2),
    m2: e.m2,
    mahalle: e.mahalle_norm,
    imar: e.imar_durumu,
    mesafe_m: Math.round(e.mesafeM),
    yas_gun: Math.round((Date.now() - e.yakalanma_tarihi) / 86_400_000),
  }));

  // ── İmar / emsal / TAKS ayarları ──
  const hamMedyan = medyan!;
  const ayarlar: Array<{ ad: string; carpan: number; not: string }> = [];
  const tipC = imarTipiCarpani(imarTipi, kategori);
  if (tipC.carpan !== 1) ayarlar.push({ ad: "İmar tipi", carpan: tipC.carpan, not: tipC.not });
  const eC = emsalCarpani(emsalVal);
  if (eC) ayarlar.push({ ad: "Emsal", carpan: eC.carpan, not: eC.not });
  const tC = taksCarpani(taksVal);
  if (tC) ayarlar.push({ ad: "TAKS", carpan: tC.carpan, not: tC.not });

  let toplamCarpan = 1;
  for (const a of ayarlar) toplamCarpan *= a.carpan;
  // Agresif sapmayı sınırla
  toplamCarpan = Math.min(2.2, Math.max(0.5, toplamCarpan));

  medyan = Math.round(hamMedyan * toplamCarpan);
  alt = Math.round((alt ?? hamMedyan * 0.8) * toplamCarpan);
  ust = Math.round((ust ?? hamMedyan * 1.25) * toplamCarpan);

  // Güven skoru
  let guven = 0;
  if (kaynak === "spatial-radius") {
    guven = Math.min(95, 50 + filtered.length * 3 + (radiusKm === 5 ? 15 : radiusKm === 10 ? 5 : 0));
  } else if (kaynak === "mahalle-istatistik") {
    guven = 70;
  } else if (kaynak === "ilce-istatistik") {
    guven = 58;
  } else {
    guven = 30;
  }
  if (ayarlar.length > 0) guven = Math.min(95, guven + 5);
  if (imarTipi === "belirsiz" && emsalVal == null) guven = Math.max(20, guven - 5);

  const toplam =
    parselM2 != null && medyan != null
      ? {
          alt: Math.round((alt ?? medyan) * parselM2),
          orta: Math.round(medyan * parselM2),
          ust: Math.round((ust ?? medyan) * parselM2),
        }
      : null;

  // Fizibilite özeti (m² + emsal + taks varsa)
  let fizibiliteOzet: {
    taban_m2: number;
    insaat_m2: number;
    tahmini_kat: number;
  } | null = null;
  if (parselM2 && emsalVal && taksVal) {
    fizibiliteOzet = {
      taban_m2: Math.round(parselM2 * taksVal),
      insaat_m2: Math.round(parselM2 * emsalVal),
      tahmini_kat: Math.round((emsalVal / taksVal) * 10) / 10,
    };
  }

  const yatirimSkoru = yatirimSkoruHesapla({
    guvenSkoru: guven,
    kaynak,
    emsalAdet: filtered.length,
    imarTipi,
    emsal: emsalVal,
    taks: taksVal,
    toplamCarpan,
    altTlm2: alt,
    ustTlm2: ust,
    medyanTlm2: medyan,
  });

  c.header("Cache-Control", "public, s-maxage=300");
  return c.json({
    ok: true,
    kaynak,
    guven_skoru: guven,
    lat: hasCoords ? body.lat : null,
    lng: hasCoords ? body.lng : null,
    lokasyon: lokasyonEtiket,
    il: ilNorm || null,
    ilce: ilceNorm || null,
    mahalle: mahalleNorm || null,
    kategori,
    m2: parselM2,
    imar_tipi: imarTipi,
    emsal: emsalVal,
    taks: taksVal,
    radius_km: radiusKm,
    emsal_adet: filtered.length,
    ham_medyan_tlm2: hamMedyan,
    medyan_tlm2: medyan,
    alt_tlm2: alt,
    ust_tlm2: ust,
    toplam_carpan: Math.round(toplamCarpan * 1000) / 1000,
    ayarlar,
    toplam_tl: toplam,
    fizibilite_ozet: fizibiliteOzet,
    yatirim_skoru: yatirimSkoru,
    emsaller,
    halka_dagilimi: {
      r0_1km: filtered.filter((f) => f.mesafeM <= 1000).length,
      r1_3km: filtered.filter((f) => f.mesafeM > 1000 && f.mesafeM <= 3000).length,
      r3_5km: filtered.filter((f) => f.mesafeM > 3000 && f.mesafeM <= 5000).length,
    },
    kalan_kota: rate.kalan,
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
  const latDelta = radiusKm / 111;
  const lngDelta = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));
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
