/**
 * Seed & veri yükleme endpoint'leri — index.ts'ten taşındı (SRP).
 *
 *   POST /v1/baseline/seed       — AI mahalle baseline seed (SEED_SECRET)
 *   POST /v1/ilan/batch-seed     — Emlakjet toplu ilan yükleme (SEED_SECRET)
 *   GET  /v1/istatistik/sayim    — D1 ilan sayım raporu (STATS_SECRET)
 *
 * Tüm endpoint'ler Bearer token korumalıdır.
 */
import { Hono } from "hono";
import type { Env } from "../index.js";
import { bearerYetkilendir } from "../lib/security.js";

export const seedRoutes = new Hono<{ Bindings: Env }>();

// ── Geçerli kategori seti (her iki seed endpoint'i paylaşır) ─────────────────
const GECERLI_SEED_KATEGORI = new Set([
  "arsa", "tarla", "konut", "bahce", "bag", "zeytinlik",
]);

// ── POST /v1/baseline/seed ───────────────────────────────────────────────────
/**
 * AI mahalle baseline seed — extension'ın yerel mahalle-baseline.ts'inin
 * sunucu kopyasını D1'e yükler.
 *
 * Auth: Bearer SEED_SECRET
 * Body: { rows: Array<{ il_norm, ilce_norm, mahalle_norm, kategori, tlm2, guven?, kaynak?, yakalandi? }> }
 */
seedRoutes.post("/baseline/seed", async (c) => {
  const yetki = await bearerYetkilendir(
    c.req.header("Authorization"),
    c.env.SEED_SECRET,
  );
  if (!yetki) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json<{
    rows: Array<{
      il_norm: string; ilce_norm: string; mahalle_norm: string; kategori: string;
      tlm2: number; guven?: number; kaynak?: string; yakalandi?: number;
    }>;
  }>().catch(() => null);

  if (!body?.rows || !Array.isArray(body.rows)) {
    return c.json({ error: "Geçersiz body" }, 400);
  }

  const NORM_MAX = 80;
  let inserted = 0;

  for (const r of body.rows) {
    if (
      !r.il_norm || typeof r.il_norm !== "string" || r.il_norm.length > NORM_MAX ||
      !r.ilce_norm || typeof r.ilce_norm !== "string" || r.ilce_norm.length > NORM_MAX ||
      !r.mahalle_norm || typeof r.mahalle_norm !== "string" || r.mahalle_norm.length > NORM_MAX ||
      !r.kategori || !GECERLI_SEED_KATEGORI.has(r.kategori) ||
      typeof r.tlm2 !== "number" || r.tlm2 <= 0 || r.tlm2 > 1_000_000_000
    ) continue;

    try {
      await c.env.DB.prepare(
        `INSERT INTO mahalle_baseline_ai
           (il_norm, ilce_norm, mahalle_norm, kategori, tlm2, guven, kaynak, yakalandi)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(il_norm, ilce_norm, mahalle_norm, kategori) DO UPDATE SET
           tlm2 = excluded.tlm2, guven = excluded.guven,
           kaynak = excluded.kaynak, yakalandi = excluded.yakalandi`,
      ).bind(
        r.il_norm, r.ilce_norm, r.mahalle_norm, r.kategori,
        r.tlm2, r.guven ?? 30, r.kaynak ?? "knn-smoothing",
        r.yakalandi ?? Date.now(),
      ).run();
      inserted++;
    } catch {
      // Malformed row — sessizce atla
    }
  }

  return c.json({ inserted, requested: body.rows.length });
});

// ── POST /v1/ilan/batch-seed ─────────────────────────────────────────────────
/**
 * Emlakjet toplu ilan yükleme — wrangler d1 execute timeout/boyut aşımı
 * durumunda chunk'larla göndermeyi sağlar.
 *
 * Auth: Bearer SEED_SECRET
 * Max rows per request: 500
 */
const GECERLI_ILAN_KATEGORI = new Set([
  "arsa", "tarla", "konut", "bahce", "bag", "zeytinlik",
]);

seedRoutes.post("/ilan/batch-seed", async (c) => {
  const yetki = await bearerYetkilendir(
    c.req.header("Authorization"),
    c.env.SEED_SECRET,
  );
  if (!yetki) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json<{
    rows: Array<{
      ilan_no: string;
      il_norm: string;
      ilce_norm: string;
      mahalle_norm?: string | null;
      fiyat_per_m2: number;
      m2?: number | null;
      kategori: string;
      lat?: number | null;
      lng?: number | null;
    }>;
  }>().catch(() => null);

  if (!body?.rows || !Array.isArray(body.rows)) {
    return c.json({ error: "Geçersiz body — rows dizisi gerekli" }, 400);
  }
  if (body.rows.length > 500) {
    return c.json({ error: "Maksimum 500 satır/istek. Chunk'layarak gönderin." }, 400);
  }

  const ts = Date.now();
  let inserted = 0, skipped = 0, hatali = 0;

  for (const r of body.rows) {
    if (
      !r.ilan_no || typeof r.ilan_no !== "string" || r.ilan_no.length > 50 ||
      !r.il_norm || typeof r.il_norm !== "string" || r.il_norm.length > 50 ||
      !r.ilce_norm || typeof r.ilce_norm !== "string" || r.ilce_norm.length > 50 ||
      !r.kategori || !GECERLI_ILAN_KATEGORI.has(r.kategori) ||
      typeof r.fiyat_per_m2 !== "number" || r.fiyat_per_m2 <= 0 || r.fiyat_per_m2 > 1_000_000_000
    ) { hatali++; continue; }

    // Koordinat bbox kontrolü (Türkiye)
    const lat = r.lat ?? null;
    const lng = r.lng ?? null;
    if (lat !== null && (lat < 35 || lat > 43)) { hatali++; continue; }
    if (lng !== null && (lng < 25 || lng > 46)) { hatali++; continue; }

    try {
      const result = await c.env.DB.prepare(
        `INSERT OR IGNORE INTO ilanlar
           (kaynak, ilan_no, il_norm, ilce_norm, mahalle_norm,
            fiyat_per_m2, m2, kategori, para_birimi, yakalanma_tarihi,
            lat, lng, koord_kaynagi, aktif)
         VALUES ('emlakjet', ?, ?, ?, ?, ?, ?, ?, 'TL', ?, ?, ?, ?, 1)`,
      ).bind(
        r.ilan_no, r.il_norm, r.ilce_norm, r.mahalle_norm ?? null,
        r.fiyat_per_m2, r.m2 ?? null, r.kategori, ts,
        lat, lng, lat !== null ? "mahalle-merkez" : null,
      ).run();
      if ((result.meta.changes ?? 0) > 0) inserted++;
      else skipped++;
    } catch {
      hatali++;
    }
  }

  return c.json({ ok: true, requested: body.rows.length, inserted, skipped, hatali });
});

// ── GET /v1/istatistik/sayim ─────────────────────────────────────────────────
/**
 * D1 ilan sayım raporu — kategori dağılımı + aktif/toplam.
 * Auth: Bearer STATS_SECRET
 */
seedRoutes.get("/istatistik/sayim", async (c) => {
  const yetki = await bearerYetkilendir(
    c.req.header("Authorization"),
    c.env.STATS_SECRET,
  );
  if (!yetki) return c.json({ error: "Unauthorized" }, 401);

  const [kategoriler, aktif, toplam] = await Promise.all([
    c.env.DB.prepare(
      `SELECT kategori, COUNT(*) as adet
       FROM ilanlar WHERE aktif = 1
       GROUP BY kategori ORDER BY adet DESC`,
    ).all<{ kategori: string; adet: number }>(),
    c.env.DB.prepare(
      `SELECT COUNT(*) as n FROM ilanlar WHERE aktif = 1`,
    ).first<{ n: number }>(),
    c.env.DB.prepare(
      `SELECT COUNT(*) as n FROM ilanlar`,
    ).first<{ n: number }>(),
  ]);

  const dagilim: Record<string, number> = {};
  for (const r of (kategoriler.results ?? [])) {
    dagilim[r.kategori] = r.adet;
  }
  const arsaTarla = (dagilim["arsa"] ?? 0) + (dagilim["tarla"] ?? 0);

  return c.json({
    kategori: dagilim,
    arsa_tarla_toplam: arsaTarla,
    hedef_50k: arsaTarla >= 50_000,
    aktif: aktif?.n ?? 0,
    toplam: toplam?.n ?? 0,
    ts: Date.now(),
  });
});
