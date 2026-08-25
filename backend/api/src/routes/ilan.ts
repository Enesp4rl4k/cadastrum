/**
 * POST /v1/ilan — extension crowdsource veya scraper'dan tek ilan kaydı.
 * POST /v1/ilan/batch — toplu (max 100 ilan)
 *
 * Rate limiting: per IP, default 100 req/saat (env: RATE_LIMIT_PER_HOUR)
 */
import { Hono } from "hono";
import type { z } from "zod";
import type { Env } from "../index.js";
import { normalizeYerAdi } from "../lib/normalize.js";
import { rateLimitMiddleware } from "../lib/rate-limit.js";

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

import { IlanIngestSchema } from "../lib/validation.js";
type ValidIlan = z.infer<typeof IlanIngestSchema> & { koord_kaynagi?: string };

function ilanValidate(input: unknown) {
  // Extension/scraper'ın eski snake_case payload'larını yeni API sözleşmesine
  // tek sınırda dönüştürür; bundan sonraki kod yalnızca camelCase kullanır.
  const raw = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const normalized = {
    ...raw,
    ilanNo: raw.ilanNo ?? raw.ilan_no,
    fiyatPerM2: raw.fiyatPerM2 ?? raw.fiyat_per_m2,
    paraBirimi: raw.paraBirimi ?? raw.para_birimi,
    imarDurumu: raw.imarDurumu ?? raw.imar_durumu,
  };
  const result = IlanIngestSchema.safeParse(normalized);
  if (!result.success) {
    return { ok: false as const, error: result.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ") };
  }
  return { ok: true as const, ilan: result.data, ilanTarihi: raw.ilanTarihi ?? raw.ilan_tarihi };
}

// Merkezi rate-limit middleware — ilan POST endpoint'leri için 100 req/saat.
// NOT: Batch (/batch) SCRAPER_API_SECRET gerektirdiği için rate limit daha az kritik
// ama tutarlılık için middleware'e bırakıyoruz (index.ts'deki global limit de çalışıyor).
ilanRoutes.post("/", rateLimitMiddleware(100, "ilan-post"), async (c) => {
  // ip ve kalan kota artık middleware tarafından X-RateLimit-* header'larında dönüyor.

  const body = await c.req.json<IlanInput>().catch(() => null);
  if (!body) return c.json({ error: "Geçersiz JSON" }, 400);

  const v = ilanValidate(body);
  if (!v.ok) return c.json({ error: v.error }, 422);

  const { ilan } = v;
  const il_norm = normalizeYerAdi(ilan.il);
  const ilce_norm = normalizeYerAdi(ilan.ilce);
  const mahalle_norm = ilan.mahalle ? normalizeYerAdi(ilan.mahalle) : null;

  const koord = koordSanitize(ilan.lat ?? undefined, ilan.lng ?? undefined);
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
      ilan.ilanNo,
      il_norm,
      ilce_norm,
      mahalle_norm,
      ilan.fiyatPerM2,
      ilan.m2 ?? null,
      ilan.kategori,
      ilan.imarDurumu ?? null,
      ilan.paraBirimi ?? "TL",
      typeof v.ilanTarihi === "number" ? v.ilanTarihi : null,
      Date.now(),
      koord.lat,
      koord.lng,
      koordKaynagi,
    ).run();
    const guncellendiMi = (res.meta?.changes ?? 0) > 0;
    return c.json({ ok: true, upsert: guncellendiMi }, 201);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return c.json({ error: msg }, 500);
  }
});

ilanRoutes.post("/batch", async (c) => {
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  // S3: timing-safe compare
  const { bearerYetkilendir } = await import("../lib/security.js");
  const yetki = await bearerYetkilendir(c.req.header("Authorization"), c.env.SCRAPER_API_SECRET);
  if (!yetki) {
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
    const ilan = (v as unknown as { ilan: ValidIlan }).ilan;
    const koord = koordSanitize(ilan.lat ?? undefined, ilan.lng ?? undefined);
    const koordKaynagi =
      koord.lat != null && ilan.koord_kaynagi && VALID_KOORD_KAYNAK.has(ilan.koord_kaynagi)
        ? ilan.koord_kaynagi
        : null;
    return stmt.bind(
      ilan.kaynak,
      ilan.ilanNo,
      normalizeYerAdi(ilan.il!),
      normalizeYerAdi(ilan.ilce!),
      ilan.mahalle ? normalizeYerAdi(ilan.mahalle) : null,
      ilan.fiyatPerM2,
      ilan.m2 ?? null,
      ilan.kategori,
      ilan.imarDurumu ?? null,
      ilan.paraBirimi ?? "TL",
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

// ── POST /v1/ilan/katki ─────────────────────────────────────────────────
// Crowdsource: normal kullanıcının liste/arama sayfasında gördüğü ilanlar
// (opt-in, admin secret'i GEREKMEZ). /batch admin scrape içindir (yüksek güven);
// bu ise düşük-güven topluluk katkısı — kaynak zorla 'extension', sıkı validasyon,
// ilan_no ile INSERT OR IGNORE dedup. Arsa kapsamasını asıl bu büyütür.
ilanRoutes.post("/katki", async (c) => {
  const body = await c.req.json<{ ilanlar: IlanInput[] }>().catch(() => null);
  if (!body?.ilanlar || !Array.isArray(body.ilanlar)) return c.json({ error: "Geçersiz body" }, 400);
  if (body.ilanlar.length === 0) return c.json({ error: "ilanlar boş" }, 400);
  if (body.ilanlar.length > 100) return c.json({ error: "Max 100 ilan" }, 400);

  let hata = 0;
  const gecerli: Array<Extract<ReturnType<typeof ilanValidate>, { ok: true }>> = [];
  for (const item of body.ilanlar) {
    // Güven spoofing'i engelle — crowdsource her zaman 'extension' kaynaklıdır.
    const v = ilanValidate({ ...item, kaynak: "extension" });
    if (!v.ok) { hata++; continue; }
    gecerli.push(v);
  }

  const stmt = c.env.DB.prepare(
    `INSERT OR IGNORE INTO ilanlar (kaynak, ilan_no, il_norm, ilce_norm, mahalle_norm,
      fiyat_per_m2, m2, kategori, imar_durumu, para_birimi, yakalanma_tarihi,
      lat, lng, koord_kaynagi)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const now = Date.now();
  const stmts = gecerli.map((v) => {
    const ilan = (v as unknown as { ilan: ValidIlan }).ilan;
    const koord = koordSanitize(ilan.lat ?? undefined, ilan.lng ?? undefined);
    const koordKaynagi =
      koord.lat != null && ilan.koord_kaynagi && VALID_KOORD_KAYNAK.has(ilan.koord_kaynagi)
        ? ilan.koord_kaynagi
        : null;
    return stmt.bind(
      "extension",
      ilan.ilanNo,
      normalizeYerAdi(ilan.il!),
      normalizeYerAdi(ilan.ilce!),
      ilan.mahalle ? normalizeYerAdi(ilan.mahalle) : null,
      ilan.fiyatPerM2,
      ilan.m2 ?? null,
      ilan.kategori,
      ilan.imarDurumu ?? null,
      ilan.paraBirimi ?? "TL",
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
        const changed = (r as { meta?: { changes?: number } }).meta?.changes ?? 0;
        if (changed > 0) basarili++;
        else duplicate++;
      }
    } catch {
      hata += stmts.length;
    }
  }
  return c.json({ basarili, hata, duplicate });
});
