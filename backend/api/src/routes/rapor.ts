/**
 * Paylaşılabilir Yatırımcı Raporu — public shareable link.
 *
 *   POST /v1/rapor        { html, baslik?, ttlGun? } → { id, url, bitis }
 *   GET  /v1/rapor/:id    → text/html (public, süre dolmuşsa 410)
 *
 * İstemci (extension/site) raporu `raporHtmlUret` ile ÖNCEDEN render edip tam HTML'i
 * POST eder. Backend sadece saklar + servis eder — motor backend'de koşmaz.
 */
import { Hono } from "hono";
import type { Env } from "../index.js";

export const raporRoutes = new Hono<{ Bindings: Env }>();

const MAX_HTML = 768 * 1024;        // 768KB güvenlik sınırı
const VARSAYILAN_TTL_GUN = 90;
const MAKS_TTL_GUN = 365;

/** URL-güvenli kısa id (12 hex). */
function kisaId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

// ── POST /v1/rapor ──────────────────────────────────────────────────────
raporRoutes.post("/", async (c) => {
  const body = await c.req
    .json<{ html?: string; baslik?: string; ttlGun?: number }>()
    .catch(() => null);

  if (!body || typeof body.html !== "string" || body.html.length === 0) {
    return c.json({ error: "html zorunlu" }, 400);
  }
  if (body.html.length > MAX_HTML) {
    return c.json({ error: "html çok büyük (>768KB)" }, 413);
  }
  // Basit içerik doğrulaması — sadece tam HTML dokümanı kabul et
  if (!/^\s*<!DOCTYPE html>/i.test(body.html)) {
    return c.json({ error: "geçersiz html (DOCTYPE bekleniyor)" }, 400);
  }

  const id = kisaId();
  const now = Date.now();
  const ttlGun =
    typeof body.ttlGun === "number" && body.ttlGun > 0
      ? Math.min(Math.floor(body.ttlGun), MAKS_TTL_GUN)
      : VARSAYILAN_TTL_GUN;
  const bitis = now + ttlGun * 86_400_000;
  const baslik = (body.baslik ?? "").slice(0, 200);

  await c.env.DB.prepare(
    `INSERT INTO raporlar (id, html, baslik, olusturuldu, bitis, goruntulenme)
     VALUES (?, ?, ?, ?, ?, 0)`,
  ).bind(id, body.html, baslik, now, bitis).run();

  const origin = new URL(c.req.url).origin;
  return c.json({ id, url: `${origin}/v1/rapor/${id}`, bitis });
});

// ── GET /v1/rapor/:id ───────────────────────────────────────────────────
raporRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  if (!/^[a-z0-9]{6,32}$/i.test(id)) {
    return c.text("Geçersiz rapor id", 400);
  }
  const row = await c.env.DB.prepare(
    `SELECT html, bitis FROM raporlar WHERE id = ?`,
  ).bind(id).first<{ html: string; bitis: number | null }>();

  if (!row) return c.text("Rapor bulunamadı", 404);
  if (row.bitis && Date.now() > row.bitis) return c.text("Rapor süresi doldu", 410);

  // Görüntülenme sayacı — best-effort, yanıtı bloklama
  try {
    await c.env.DB.prepare(
      `UPDATE raporlar SET goruntulenme = goruntulenme + 1 WHERE id = ?`,
    ).bind(id).run();
  } catch {
    /* sayaç kritik değil */
  }

  return c.html(row.html);
});
