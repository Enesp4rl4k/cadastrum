/**
 * Bildirim sistemi endpoint'leri — Faz 4 Sprint G.
 *
 *   GET    /v1/bildirim/list           → kullanıcının abonelikleri
 *   POST   /v1/bildirim/abone          → yeni abonelik oluştur
 *   PUT    /v1/bildirim/:id/durum      → 'aktif' / 'pasif' togglesi
 *   DELETE /v1/bildirim/:id            → kalıcı sil
 *
 * Tüm endpoint'ler JWT bearer zorunlu. Tier kontrolü:
 *   - Free:       max 1 abonelik (watch listesi cazibe)
 *   - Pro:        max 25 abonelik
 *   - Pro+/Kurumsal: sınırsız
 */
import { Hono } from "hono";
import type { Env } from "../index.js";
import { jwtMiddleware } from "./hesap.js";

export const bildirimRoutes = new Hono<{ Bindings: Env }>();

bildirimRoutes.use("/*", jwtMiddleware);

type BildirimTipi = "fiyat-degisimi" | "yeni-emsal" | "esik-asildi";
const VALID_TIP = new Set<BildirimTipi>(["fiyat-degisimi", "yeni-emsal", "esik-asildi"]);

interface AbonelikRow {
  id: number;
  kullanici_id: number;
  tip: BildirimTipi;
  parametre_json: string;
  son_tetik: number | null;
  son_baseline: number | null;
  durum: "aktif" | "pasif";
  olusturuldu: number;
}

const TIER_LIMIT: Record<string, number> = {
  free: 1,
  pro: 25,
  pro_plus: Infinity,
  kurumsal: Infinity,
};

interface AboneInput {
  tip?: BildirimTipi;
  parametre?: Record<string, unknown>;
}

function turkiyeBboxIcinde(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === "number" && typeof lng === "number" &&
    lat > 35 && lat < 43 && lng > 25 && lng < 46
  );
}

// ── GET /list ────────────────────────────────────────────────────────────────
bildirimRoutes.get("/list", async (c) => {
  const kullaniciId = c.get("kullaniciId" as never) as number;
  const rows = await c.env.DB.prepare(
    `SELECT id, tip, parametre_json, son_tetik, durum, olusturuldu
     FROM bildirim_aboneligi
     WHERE kullanici_id = ?
     ORDER BY olusturuldu DESC`,
  ).bind(kullaniciId).all<Omit<AbonelikRow, "kullanici_id" | "son_baseline">>();
  return c.json({
    abonelikler: (rows.results ?? []).map((r) => ({
      ...r,
      parametre: safeJson(r.parametre_json),
    })),
  });
});

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

// ── POST /abone ──────────────────────────────────────────────────────────────
bildirimRoutes.post("/abone", async (c) => {
  const kullaniciId = c.get("kullaniciId" as never) as number;
  const tier = (c.get("tier" as never) as string) ?? "free";
  const body = await c.req.json<AboneInput>().catch(() => null);
  if (!body || !body.tip || !VALID_TIP.has(body.tip)) {
    return c.json({ hata: "Geçersiz tip" }, 422);
  }
  const par = body.parametre ?? {};
  // Tüm tipler lat/lng/radius gerektirir
  if (!turkiyeBboxIcinde(par.lat, par.lng)) {
    return c.json({ hata: "lat/lng eksik veya Türkiye dışı" }, 422);
  }
  if (typeof par.radius_km !== "number" || par.radius_km <= 0 || par.radius_km > 30) {
    return c.json({ hata: "radius_km 0-30 aralığında olmalı" }, 422);
  }

  // Tier limit kontrolü
  const sayi = await c.env.DB.prepare(
    `SELECT COUNT(*) as n FROM bildirim_aboneligi WHERE kullanici_id = ? AND durum = 'aktif'`,
  ).bind(kullaniciId).first<{ n: number }>();
  const limit = TIER_LIMIT[tier] ?? 1;
  if ((sayi?.n ?? 0) >= limit) {
    return c.json({
      hata: `Aktif abonelik limiti aşıldı (${tier} tier: ${limit}). Pasifleştirin veya tier yükseltin.`,
    }, 403);
  }

  await c.env.DB.prepare(
    `INSERT INTO bildirim_aboneligi
       (kullanici_id, tip, parametre_json, durum, olusturuldu)
     VALUES (?, ?, ?, 'aktif', ?)`,
  ).bind(kullaniciId, body.tip, JSON.stringify(par), Date.now()).run();
  return c.json({ ok: true }, 201);
});

// ── PUT /:id/durum ───────────────────────────────────────────────────────────
bildirimRoutes.put("/:id/durum", async (c) => {
  const kullaniciId = c.get("kullaniciId" as never) as number;
  const id = parseInt(c.req.param("id"), 10);
  const body = await c.req.json<{ durum?: "aktif" | "pasif" }>().catch(() => null);
  if (!body || (body.durum !== "aktif" && body.durum !== "pasif")) {
    return c.json({ hata: "durum 'aktif' veya 'pasif' olmalı" }, 422);
  }
  const r = await c.env.DB.prepare(
    `UPDATE bildirim_aboneligi SET durum = ? WHERE id = ? AND kullanici_id = ?`,
  ).bind(body.durum, id, kullaniciId).run();
  if ((r.meta?.changes ?? 0) === 0) {
    return c.json({ hata: "Abonelik bulunamadı" }, 404);
  }
  return c.json({ ok: true });
});

// ── DELETE /:id ──────────────────────────────────────────────────────────────
bildirimRoutes.delete("/:id", async (c) => {
  const kullaniciId = c.get("kullaniciId" as never) as number;
  const id = parseInt(c.req.param("id"), 10);
  await c.env.DB.prepare(
    `DELETE FROM bildirim_aboneligi WHERE id = ? AND kullanici_id = ?`,
  ).bind(id, kullaniciId).run();
  return c.json({ ok: true });
});
