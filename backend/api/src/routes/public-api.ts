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
import { kmToDegrees, turkiyeBboxIcinde } from "../lib/geo.js";
import { log } from "../lib/logger.js";

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

  // Rate limit — atomik UPSERT RETURNING (TOCTOU race yok)
  const dakika = Math.floor(Date.now() / 60000);
  const rr = await c.env.DB.prepare(
    `INSERT INTO api_token_rate (token_id, dakika, istek_sayisi) VALUES (?, ?, 1)
     ON CONFLICT(token_id, dakika) DO UPDATE SET istek_sayisi = istek_sayisi + 1
     RETURNING istek_sayisi`,
  ).bind(tok.id, dakika).first<{ istek_sayisi: number }>();
  const yeniSayi = rr?.istek_sayisi ?? 1;
  if (yeniSayi > tok.rate_limit_per_min) {
    return c.json({ error: "Rate limit exceeded" }, 429);
  }

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
  const radiusKm = Math.min(parseFloat(c.req.query("radius_km") ?? "5"), 20);
  const kategori = c.req.query("kategori") ?? "arsa";
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !turkiyeBboxIcinde(lat, lng)) {
    return c.json({ error: "Geçersiz lat/lng (Türkiye bbox dışı)" }, 400);
  }
  const { latDelta, lngDelta } = kmToDegrees(radiusKm, lat);
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

// Deprem PGA değerleri — 81 il için statik tablo (AFAD TDTH kaynaklı)
// Backend'e kopyalandı ki extension lib import gerekmeden dönebilsin.
const IL_PGA: Record<string, number> = {
  adana: 0.35, adiyaman: 0.40, afyonkarahisar: 0.25, agri: 0.30, aksaray: 0.20,
  amasya: 0.20, ankara: 0.15, antalya: 0.25, ardahan: 0.25, artvin: 0.30,
  aydin: 0.35, balikesir: 0.30, bartin: 0.15, batman: 0.30, bayburt: 0.30,
  bilecik: 0.30, bingol: 0.45, bitlis: 0.35, bolu: 0.40, burdur: 0.30,
  bursa: 0.30, canakkale: 0.35, cankiri: 0.20, corum: 0.20, denizli: 0.35,
  diyarbakir: 0.30, duzce: 0.45, edirne: 0.10, elazig: 0.40, erzincan: 0.50,
  erzurum: 0.35, eskisehir: 0.20, gaziantep: 0.35, giresun: 0.30, gumushane: 0.30,
  hakkari: 0.35, hatay: 0.40, igdir: 0.30, isparta: 0.25, istanbul: 0.35,
  izmir: 0.40, kahramanmaras: 0.45, karabuk: 0.15, karaman: 0.15, kars: 0.30,
  kastamonu: 0.15, kayseri: 0.20, kilis: 0.35, kirikkale: 0.15, kirklareli: 0.10,
  kirsehir: 0.20, kocaeli: 0.40, konya: 0.15, kutahya: 0.25, malatya: 0.40,
  manisa: 0.35, mardin: 0.30, mersin: 0.25, mugla: 0.30, mus: 0.40,
  nevsehir: 0.15, nigde: 0.15, ordu: 0.25, osmaniye: 0.35, rize: 0.30,
  sakarya: 0.40, samsun: 0.20, sanliurfa: 0.30, siirt: 0.35, sinop: 0.15,
  sirnak: 0.35, sivas: 0.25, tekirdag: 0.15, tokat: 0.25, trabzon: 0.25,
  tunceli: 0.45, usak: 0.30, van: 0.40, yalova: 0.40, yozgat: 0.20, zonguldak: 0.15,
};

function pgaToZon(pga: number): string {
  if (pga >= 0.40) return "Z1";
  if (pga >= 0.20) return "Z2";
  if (pga >= 0.10) return "Z3";
  return "Z4";
}

function pgaToFiyatCarpani(pga: number): number {
  if (pga >= 0.40) return 0.88;
  if (pga >= 0.30) return 0.94;
  if (pga >= 0.20) return 0.97;
  if (pga >= 0.10) return 1.00;
  return 1.04;
}

publicApiRoutes.get("/risk/deprem", apiKeyMiddleware, async (c) => {
  const il = (c.req.query("il") ?? "").toLocaleLowerCase("tr")
    .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s")
    .replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c").trim();
  const pga = IL_PGA[il];
  if (pga === undefined) {
    return c.json({ error: "İl bulunamadı (normalize: küçük harf, TR→Latin)" }, 404);
  }
  return c.json({
    il,
    pga,
    zon: pgaToZon(pga),
    fiyat_carpani: pgaToFiyatCarpani(pga),
    aciklama: `PGA ${pga}g — ${pgaToZon(pga)} bölgesi`,
  });
});

// Taşkın risk tablosu — il bazlı (Open-Meteo GloFAS il agregesi)
const IL_TASKIN: Record<string, { risk: "yuksek" | "orta" | "dusuk"; carpan: number }> = {
  rize: { risk: "yuksek", carpan: 0.88 }, artvin: { risk: "yuksek", carpan: 0.90 },
  giresun: { risk: "yuksek", carpan: 0.92 }, ordu: { risk: "orta", carpan: 0.96 },
  trabzon: { risk: "orta", carpan: 0.96 }, kastamonu: { risk: "orta", carpan: 0.97 },
  sinop: { risk: "orta", carpan: 0.97 }, bartin: { risk: "orta", carpan: 0.97 },
  zonguldak: { risk: "orta", carpan: 0.97 }, duzce: { risk: "orta", carpan: 0.96 },
  bolu: { risk: "orta", carpan: 0.97 }, sakarya: { risk: "orta", carpan: 0.96 },
  samsun: { risk: "orta", carpan: 0.97 }, hatay: { risk: "orta", carpan: 0.96 },
  adana: { risk: "orta", carpan: 0.97 }, mersin: { risk: "orta", carpan: 0.97 },
};

publicApiRoutes.get("/risk/taskin", apiKeyMiddleware, async (c) => {
  const il = (c.req.query("il") ?? "").toLocaleLowerCase("tr")
    .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s")
    .replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c").trim();
  const bilgi = IL_TASKIN[il] ?? { risk: "dusuk", carpan: 1.0 };
  return c.json({
    il,
    risk: bilgi.risk,
    fiyat_carpani: bilgi.carpan,
    aciklama: `${bilgi.risk === "yuksek" ? "Yüksek" : bilgi.risk === "orta" ? "Orta" : "Düşük"} taşkın riski`,
    kaynak: "il-tablo",
  });
});
