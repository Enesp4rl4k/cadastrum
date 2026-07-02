/**
 * Hata telemetrisi — extension/backend runtime hatalarını topla (observability).
 *
 *   POST /v1/telemetri/hata   { hatalar: [{ kaynak, mesaj, stack?, surum?, meta?, ts? }] }
 *   GET  /v1/telemetri/ozet?secret=XXX&gun=7   → kaynak dağılımı + son hatalar (admin)
 *
 * Motor yükü yok; sadece ingest + özet. PII göndermemek istemcinin sorumluluğunda.
 */
import { Hono } from "hono";
import type { Env } from "../index.js";

export const telemetriRoutes = new Hono<{ Bindings: Env }>();

const MAX_BATCH = 50;
const MAX_MESAJ = 2000;
const MAX_STACK = 8000;
const MAX_META = 2000;

// ── POST /v1/telemetri/hata ─────────────────────────────────────────────
telemetriRoutes.post("/hata", async (c) => {
  const body = await c.req
    .json<{ hatalar?: Array<Record<string, unknown>> }>()
    .catch(() => null);
  const hatalar = body?.hatalar;
  if (!Array.isArray(hatalar) || hatalar.length === 0) {
    return c.json({ error: "hatalar[] zorunlu" }, 400);
  }
  if (hatalar.length > MAX_BATCH) {
    return c.json({ error: "batch çok büyük (>50)" }, 413);
  }

  let yazilan = 0;
  for (const h of hatalar) {
    const mesaj = typeof h?.mesaj === "string" ? h.mesaj.slice(0, MAX_MESAJ) : "";
    if (!mesaj) continue;
    const kaynak = String(h.kaynak ?? "bilinmiyor").slice(0, 60);
    const stack = h.stack ? String(h.stack).slice(0, MAX_STACK) : null;
    const surum = h.surum ? String(h.surum).slice(0, 20) : null;
    const meta = h.meta != null ? JSON.stringify(h.meta).slice(0, MAX_META) : null;
    const ts = typeof h.ts === "number" && Number.isFinite(h.ts) ? h.ts : Date.now();
    try {
      await c.env.DB.prepare(
        `INSERT INTO hata_log (kaynak, mesaj, stack, surum, meta, ts) VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(kaynak, mesaj, stack, surum, meta, ts).run();
      yazilan++;
    } catch {
      /* tek satır hatası tüm batch'i düşürmesin */
    }
  }
  return c.json({ yazilan });
});

// ── GET /v1/telemetri/ozet (admin) ──────────────────────────────────────
telemetriRoutes.get("/ozet", async (c) => {
  if (c.req.query("secret") !== c.env.SCRAPER_API_SECRET) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const gun = Math.min(Math.max(Number(c.req.query("gun")) || 7, 1), 90);
  const esik = Date.now() - gun * 86_400_000;

  const kaynakDagilim = await c.env.DB.prepare(
    `SELECT kaynak, COUNT(*) AS adet FROM hata_log WHERE ts >= ? GROUP BY kaynak ORDER BY adet DESC`,
  ).bind(esik).all<{ kaynak: string; adet: number }>();

  const sonHatalar = await c.env.DB.prepare(
    `SELECT kaynak, mesaj, surum, ts FROM hata_log WHERE ts >= ? ORDER BY ts DESC LIMIT 20`,
  ).bind(esik).all<{ kaynak: string; mesaj: string; surum: string | null; ts: number }>();

  return c.json({
    gun,
    kaynakDagilim: kaynakDagilim.results ?? [],
    sonHatalar: sonHatalar.results ?? [],
  });
});
