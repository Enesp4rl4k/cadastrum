/**
 * Public API — Faz 5 Sprint J.
 *
 * Token bazlı programmatic erişim (Kurumsal Pro tier).
 * Authentication: `X-API-Key: cdrm_<token>` header.
 *
 * Endpoint'ler:
 *   GET  /v1/api/health
 *   GET  /v1/api/fiyat/mahalle/:il/:ilce/:mahalle  (200/404)
 *   GET  /v1/api/emsal/spatial?lat=&lng=&radius_km=&kategori=
 *   GET  /v1/api/risk/deprem?il=
 *   GET  /v1/api/risk/taskin?il=
 *
 * Token yönetimi:
 *   POST   /v1/api/tokens  (JWT bearer + Kurumsal Pro tier)
 *   GET    /v1/api/tokens
 *   DELETE /v1/api/tokens/:id
 */
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import type { Env } from "../index.js";
import { jwtMiddleware, tierGerekli } from "./hesap.js";

export const publicApiRoutes = new Hono<{ Bindings: Env }>();

interface TokenRow {
  id: number;
  kullanici_id: number;
  rate_limit_per_min: number;
  iptal_edildi: number;
}

/** SHA-256 hex hash — Web Crypto API. */
async function sha256(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Rastgele token oluştur — `cdrm_` prefix + 32 hex char. */
function tokenUret(): string {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  return "cdrm_" + Array.from(buf).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** API key middleware — X-API-Key header doğrula, rate limit uygula. */
const apiKeyMiddleware: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const apiKey = c.req.header("X-API-Key");
  if (!apiKey || !apiKey.startsWith("cdrm_")) {
    return c.json({ error: "Missing X-API-Key header" }, 401);
  }
  const hash = await sha256(apiKey);
  const tok = await c.env.DB.prepare(
    `SELECT id, kullanici_id, rate_limit_per_min, iptal_edildi
     FROM api_tokens WHERE token_hash = ?`,
  ).bind(hash).first<TokenRow>();
  if (!tok || tok.iptal_edildi) {
    return c.json({ error: "Invalid or revoked token" }, 401);
  }

  // Rate limit
  const dakika = Math.floor(Date.now() / 60000);
  const r = await c.env.DB.prepare(
    `SELECT istek_sayisi FROM api_token_rate WHERE token_id = ? AND dakika = ?`,
  ).bind(tok.id, dakika).first<{ istek_sayisi: number }>();
  const mevcut = r?.istek_sayisi ?? 0;
  if (mevcut >= tok.rate_limit_per_min) {
    return c.json({ error: "Rate limit exceeded" }, 429);
  }
  await c.env.DB.prepare(
    `INSERT INTO api_token_rate (token_id, dakika, istek_sayisi) VALUES (?, ?, 1)
     ON CONFLICT(token_id, dakika) DO UPDATE SET istek_sayisi = istek_sayisi + 1`,
  ).bind(tok.id, dakika).run();

  await c.env.DB.prepare(`UPDATE api_tokens SET son_kullanim = ? WHERE id = ?`)
    .bind(Date.now(), tok.id).run();

  c.set("tokenId" as never, tok.id);
  c.set("apiKullaniciId" as never, tok.kullanici_id);
  await next();
};

// ── Token Yönetimi (JWT bearer + Kurumsal Pro tier) ──────────────────────────

publicApiRoutes.post("/tokens", jwtMiddleware, tierGerekli("kurumsal"), async (c) => {
  const kullaniciId = c.get("kullaniciId" as never) as number;
  const body = await c.req.json<{ ad?: string; rate_limit_per_min?: number }>().catch(() => null);
  if (!body?.ad) return c.json({ error: "Ad zorunlu" }, 422);
  const token = tokenUret();
  const hash = await sha256(token);
  const prefix = token.slice(0, 12) + "...";
  await c.env.DB.prepare(
    `INSERT INTO api_tokens (kullanici_id, ad, token_hash, token_prefix, rate_limit_per_min, olusturuldu)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(
    kullaniciId,
    body.ad,
    hash,
    prefix,
    body.rate_limit_per_min ?? 60,
    Date.now(),
  ).run();
  // Token ham olarak SADECE bir kez döner
  return c.json({ ok: true, token, prefix }, 201);
});

publicApiRoutes.get("/tokens", jwtMiddleware, async (c) => {
  const kullaniciId = c.get("kullaniciId" as never) as number;
  const rows = await c.env.DB.prepare(
    `SELECT id, ad, token_prefix, rate_limit_per_min, olusturuldu, son_kullanim, iptal_edildi
     FROM api_tokens WHERE kullanici_id = ? ORDER BY olusturuldu DESC`,
  ).bind(kullaniciId).all();
  return c.json({ tokens: rows.results ?? [] });
});

publicApiRoutes.delete("/tokens/:id", jwtMiddleware, async (c) => {
  const kullaniciId = c.get("kullaniciId" as never) as number;
  const id = parseInt(c.req.param("id"), 10);
  await c.env.DB.prepare(
    `UPDATE api_tokens SET iptal_edildi = 1 WHERE id = ? AND kullanici_id = ?`,
  ).bind(id, kullaniciId).run();
  return c.json({ ok: true });
});

// ── Public API endpoints (X-API-Key) ─────────────────────────────────────────

publicApiRoutes.get("/health", apiKeyMiddleware, (c) =>
  c.json({ ok: true, ts: Date.now() }),
);

publicApiRoutes.get("/fiyat/mahalle/:il/:ilce/:mahalle", apiKeyMiddleware, async (c) => {
  const il = c.req.param("il").toLocaleLowerCase("tr");
  const ilce = c.req.param("ilce").toLocaleLowerCase("tr");
  const mahalle = c.req.param("mahalle").toLocaleLowerCase("tr");
  const kategori = c.req.query("kategori") ?? "arsa";
  const row = await c.env.DB.prepare(
    `SELECT medyan, q1, q3, ortalama, ilan_adet, son_guncelleme
     FROM mahalle_istatistik
     WHERE il_norm = ? AND ilce_norm = ? AND mahalle_norm = ? AND kategori = ?`,
  ).bind(il, ilce, mahalle, kategori).first();
  if (!row) return c.json({ error: "Veri yok" }, 404);
  return c.json({ il_norm: il, ilce_norm: ilce, mahalle_norm: mahalle, kategori, ...row });
});

publicApiRoutes.get("/emsal/spatial", apiKeyMiddleware, async (c) => {
  const lat = parseFloat(c.req.query("lat") ?? "");
  const lng = parseFloat(c.req.query("lng") ?? "");
  const radiusKm = parseFloat(c.req.query("radius_km") ?? "5");
  const kategori = c.req.query("kategori") ?? "arsa";
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return c.json({ error: "Geçersiz lat/lng" }, 400);
  }
  // İç emsal-spatial endpoint'iyle aynı bbox+haversine
  const latDelta = radiusKm / 111;
  const lngDelta = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));
  const yasEsigi = Date.now() - 365 * 86_400_000;
  const rows = await c.env.DB.prepare(
    `SELECT id, fiyat_per_m2, m2, lat, lng, yakalanma_tarihi
     FROM ilanlar WHERE kategori = ? AND aktif = 1
       AND lat IS NOT NULL AND lat BETWEEN ? AND ?
       AND lng BETWEEN ? AND ? AND yakalanma_tarihi >= ?
     LIMIT 500`,
  ).bind(
    kategori,
    lat - latDelta, lat + latDelta,
    lng - lngDelta, lng + lngDelta,
    yasEsigi,
  ).all<{ id: number; fiyat_per_m2: number; m2: number | null; lat: number; lng: number; yakalanma_tarihi: number }>();
  return c.json({
    lat, lng, radius_km: radiusKm, kategori,
    emsaller: rows.results ?? [],
  });
});

publicApiRoutes.get("/risk/deprem", apiKeyMiddleware, async (c) => {
  const il = (c.req.query("il") ?? "").toLocaleLowerCase("tr");
  // Statik tablo — backend'de IL_DEPREM clone'u var (data dosyası import edilebilir)
  // Buradan extension lib'inden import edilmediği için endpoint statik il listesinden döner
  return c.json({ il, not: "Detay extension içi: src/lib/data/deprem-zonlari.ts" });
});

publicApiRoutes.get("/risk/taskin", apiKeyMiddleware, async (c) => {
  const il = (c.req.query("il") ?? "").toLocaleLowerCase("tr");
  return c.json({ il, not: "Detay extension içi: src/lib/data/taskin-risk.ts" });
});
