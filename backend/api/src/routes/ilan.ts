/**
 * POST /v1/ilan — extension crowdsource veya scraper'dan tek ilan kaydı.
 * POST /v1/ilan/batch — toplu (max 100 ilan)
 *
 * Rate limiting: per IP, default 100 req/saat (env: RATE_LIMIT_PER_HOUR)
 */
import { Hono } from "hono";
import type { Env } from "../index.js";
import { normalizeYerAdi } from "../lib/normalize.js";

export const ilanRoutes = new Hono<{ Bindings: Env }>();

interface IlanInput {
  kaynak?: string;
  ilan_no?: string;
  il?: string;
  ilce?: string;
  mahalle?: string;
  fiyat_per_m2?: number;
  m2?: number;
  kategori?: string;
  imar_durumu?: string;
  para_birimi?: string;
  ilan_tarihi?: number;
  /** Faz 2 — koord (opsiyonel). Server-side 3 ondalık quantize edilir. */
  lat?: number;
  lng?: number;
  koord_kaynagi?: string;
}

/** Türkiye bbox sanity + K-anonymity quantize (3 ondalık ≈ 110m). */
function koordSanitize(lat: number | undefined, lng: number | undefined): {
  lat: number | null;
  lng: number | null;
} {
  if (typeof lat !== "number" || typeof lng !== "number") return { lat: null, lng: null };
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { lat: null, lng: null };
  if (lat < 35 || lat > 43 || lng < 25 || lng > 46) return { lat: null, lng: null };
  return {
    lat: Math.round(lat * 1000) / 1000,
    lng: Math.round(lng * 1000) / 1000,
  };
}

const VALID_KOORD_KAYNAK = new Set(["dom", "mahalle-merkez", "manuel"]);

const VALID_KAYNAK = new Set(["sahibinden", "hepsiemlak", "extension", "emlakjet"]);
const VALID_KATEGORI = new Set(["arsa", "tarla", "konut", "bahce", "bag", "zeytinlik", "diger"]);

function ilanValidate(input: IlanInput): { ok: true; ilan: Required<Omit<IlanInput, "imar_durumu" | "para_birimi" | "m2" | "mahalle" | "ilan_tarihi">> & Pick<IlanInput, "imar_durumu" | "para_birimi" | "m2" | "mahalle" | "ilan_tarihi"> } | { ok: false; error: string } {
  if (!input.kaynak || !VALID_KAYNAK.has(input.kaynak)) return { ok: false, error: "Geçersiz kaynak" };
  if (!input.ilan_no || typeof input.ilan_no !== "string") return { ok: false, error: "ilan_no gerekli" };
  if (!input.il || !input.ilce) return { ok: false, error: "il ve ilce gerekli" };
  if (typeof input.fiyat_per_m2 !== "number" || input.fiyat_per_m2 <= 0 || input.fiyat_per_m2 > 10_000_000) {
    return { ok: false, error: "Geçersiz fiyat_per_m2 (0-10M)" };
  }
  if (!input.kategori || !VALID_KATEGORI.has(input.kategori)) return { ok: false, error: "Geçersiz kategori" };
  return { ok: true, ilan: input as never };
}

async function rateLimitCheck(env: Env, ip: string): Promise<{ ok: boolean; kalan: number }> {
  const limit = +env.RATE_LIMIT_PER_HOUR || 100;
  const saat = Math.floor(Date.now() / 3600_000);
  const row = await env.DB.prepare(
    `SELECT istek_sayisi FROM rate_limit WHERE ip = ? AND saat = ?`,
  ).bind(ip, saat).first<{ istek_sayisi: number }>();

  const mevcut = row?.istek_sayisi ?? 0;
  if (mevcut >= limit) return { ok: false, kalan: 0 };

  await env.DB.prepare(
    `INSERT INTO rate_limit (ip, saat, istek_sayisi) VALUES (?, ?, 1)
     ON CONFLICT(ip, saat) DO UPDATE SET istek_sayisi = istek_sayisi + 1`,
  ).bind(ip, saat).run();

  return { ok: true, kalan: limit - mevcut - 1 };
}

ilanRoutes.post("/", async (c) => {
  const ip = c.req.header("CF-Connecting-IP") ?? c.req.header("X-Forwarded-For") ?? "unknown";
  const rate = await rateLimitCheck(c.env, ip);
  if (!rate.ok) return c.json({ error: "Rate limit aşıldı (100/saat)" }, 429);

  const body = await c.req.json<IlanInput>().catch(() => null);
  if (!body) return c.json({ error: "Geçersiz JSON" }, 400);

  const v = ilanValidate(body);
  if (!v.ok) return c.json({ error: v.error }, 422);

  const { ilan } = v;
  const il_norm = normalizeYerAdi(ilan.il);
  const ilce_norm = normalizeYerAdi(ilan.ilce);
  const mahalle_norm = ilan.mahalle ? normalizeYerAdi(ilan.mahalle) : null;

  const koord = koordSanitize(body.lat, body.lng);
  const koordKaynagi =
    koord.lat != null && body.koord_kaynagi && VALID_KOORD_KAYNAK.has(body.koord_kaynagi)
      ? body.koord_kaynagi
      : null;

  try {
    // UPSERT — duplicate'te koordinat/fiyat backfill eder. Özellikle eski
    // koordsuz ilanlar yeniden tarandığında mahalle-merkez koordinatı kazanır.
    const res = await c.env.DB.prepare(
      `INSERT INTO ilanlar (
        kaynak, ilan_no, il_norm, ilce_norm, mahalle_norm, fiyat_per_m2,
        m2, kategori, imar_durumu, para_birimi, ilan_tarihi, yakalanma_tarihi,
        lat, lng, koord_kaynagi
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(kaynak, ilan_no) DO UPDATE SET
        lat = COALESCE(ilanlar.lat, excluded.lat),
        lng = COALESCE(ilanlar.lng, excluded.lng),
        koord_kaynagi = COALESCE(ilanlar.koord_kaynagi, excluded.koord_kaynagi),
        fiyat_per_m2 = excluded.fiyat_per_m2,
        m2 = COALESCE(excluded.m2, ilanlar.m2),
        imar_durumu = COALESCE(excluded.imar_durumu, ilanlar.imar_durumu),
        yakalanma_tarihi = excluded.yakalanma_tarihi,
        aktif = 1`,
    ).bind(
      ilan.kaynak,
      ilan.ilan_no,
      il_norm,
      ilce_norm,
      mahalle_norm,
      ilan.fiyat_per_m2,
      ilan.m2 ?? null,
      ilan.kategori,
      ilan.imar_durumu ?? null,
      ilan.para_birimi ?? "TL",
      ilan.ilan_tarihi ?? null,
      Date.now(),
      koord.lat,
      koord.lng,
      koordKaynagi,
    ).run();
    const guncellendiMi = (res.meta?.changes ?? 0) > 0;
    return c.json({ ok: true, kalan: rate.kalan, upsert: guncellendiMi }, 201);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return c.json({ error: msg }, 500);
  }
});

ilanRoutes.post("/batch", async (c) => {
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  const auth = c.req.header("Authorization");
  if (!auth || auth !== `Bearer ${c.env.SCRAPER_API_SECRET}`) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const body = await c.req.json<{ ilanlar: IlanInput[] }>().catch(() => null);
  if (!body?.ilanlar || !Array.isArray(body.ilanlar)) return c.json({ error: "Geçersiz body" }, 400);
  if (body.ilanlar.length > 100) return c.json({ error: "Max 100 ilan" }, 400);

  let hata = 0;
  // Validate first
  const gecerli: Array<ReturnType<typeof ilanValidate>> = [];
  for (const item of body.ilanlar) {
    const v = ilanValidate(item);
    if (!v.ok) { hata++; continue; }
    gecerli.push(v);
  }

  // Batch insert — D1 batch() tek round-trip'te çalışır.
  // INSERT OR IGNORE ile UNIQUE çakışmaları sessizce atlanır (duplicate sayısı changes ile hesaplanır)
  const stmt = c.env.DB.prepare(
    `INSERT OR IGNORE INTO ilanlar (kaynak, ilan_no, il_norm, ilce_norm, mahalle_norm,
      fiyat_per_m2, m2, kategori, imar_durumu, para_birimi, yakalanma_tarihi,
      lat, lng, koord_kaynagi)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const now = Date.now();
  const stmts = gecerli.map(v => {
    const ilan = (v as any).ilan as IlanInput;
    const koord = koordSanitize(ilan.lat, ilan.lng);
    const koordKaynagi =
      koord.lat != null && ilan.koord_kaynagi && VALID_KOORD_KAYNAK.has(ilan.koord_kaynagi)
        ? ilan.koord_kaynagi
        : null;
    return stmt.bind(
      ilan.kaynak,
      ilan.ilan_no,
      normalizeYerAdi(ilan.il!),
      normalizeYerAdi(ilan.ilce!),
      ilan.mahalle ? normalizeYerAdi(ilan.mahalle) : null,
      ilan.fiyat_per_m2,
      ilan.m2 ?? null,
      ilan.kategori,
      ilan.imar_durumu ?? null,
      ilan.para_birimi ?? "TL",
      now,
      koord.lat,
      koord.lng,
      koordKaynagi,
    );
  });
  let basarili = 0, duplicate = 0;
  if (stmts.length) {
    try {
      const sonuclar = await c.env.DB.batch(stmts);
      for (const r of sonuclar) {
        const changed = (r as any).meta?.changes ?? 0;
        if (changed > 0) basarili++;
        else duplicate++;
      }
    } catch (e) {
      hata += stmts.length;
    }
  }
  return c.json({ basarili, hata, duplicate });
});
