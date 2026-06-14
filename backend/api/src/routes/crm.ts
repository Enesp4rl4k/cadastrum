/**
 * CRM Lite endpoint'leri — Faz 5 Sprint I.
 *
 *   GET    /v1/crm/musteri          → kullanıcının müşteri listesi
 *   POST   /v1/crm/musteri          → yeni müşteri
 *   PUT    /v1/crm/musteri/:id      → güncelle
 *   DELETE /v1/crm/musteri/:id      → sil (CASCADE atamalar + notlar)
 *
 *   GET    /v1/crm/musteri/:id/parsel       → atanmış parseller
 *   POST   /v1/crm/musteri/:id/parsel       → parsel ata
 *   DELETE /v1/crm/atama/:atamaId           → atamayı kaldır
 *
 *   GET    /v1/crm/musteri/:id/not          → notlar (timeline)
 *   POST   /v1/crm/musteri/:id/not          → not ekle
 *
 * Tier gate: Kurumsal Standart+ (server-side tierGerekli middleware).
 */
import { Hono } from "hono";
import type { Env } from "../index.js";
import { jwtMiddleware, tierGerekli } from "./hesap.js";

export const crmRoutes = new Hono<{ Bindings: Env }>();

crmRoutes.use("/*", jwtMiddleware);
crmRoutes.use("/*", tierGerekli("pro_plus")); // pro_plus = kurumsal-standart eşdeğeri

interface MusteriInput {
  ad?: string;
  telefon?: string;
  email?: string;
  notlar?: string;
  etiketler?: string[];
}

interface ParselAtamaInput {
  il_norm?: string;
  ilce_norm?: string;
  mahalle_norm?: string;
  ada_no?: number;
  parsel_no?: number;
  alan_m2?: number;
  fiyat_tahmin_tlm2?: number;
  not_text?: string;
}

interface NotInput {
  metin?: string;
  parsel_atama_id?: number;
}

// ── MÜŞTERİ CRUD ──────────────────────────────────────────────────────────────

crmRoutes.get("/musteri", async (c) => {
  const sahipId = c.get("kullaniciId" as never) as number;
  const rows = await c.env.DB.prepare(
    `SELECT id, ad, telefon, email, notlar, etiketler, olusturuldu, guncellendi
     FROM musteri WHERE sahip_id = ? ORDER BY guncellendi DESC`,
  ).bind(sahipId).all();
  return c.json({ musteriler: rows.results ?? [] });
});

crmRoutes.post("/musteri", async (c) => {
  const sahipId = c.get("kullaniciId" as never) as number;
  const body = await c.req.json<MusteriInput>().catch(() => null);
  if (!body?.ad || body.ad.trim().length < 2) {
    return c.json({ hata: "Ad zorunlu (min 2 karakter)" }, 422);
  }
  const now = Date.now();
  const result = await c.env.DB.prepare(
    `INSERT INTO musteri (sahip_id, ad, telefon, email, notlar, etiketler, olusturuldu, guncellendi)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
  ).bind(
    sahipId,
    body.ad.trim(),
    body.telefon?.trim() ?? null,
    body.email?.trim() ?? null,
    body.notlar?.trim() ?? null,
    body.etiketler?.join(",") ?? null,
    now,
    now,
  ).first<{ id: number }>();
  return c.json({ ok: true, id: result?.id }, 201);
});

crmRoutes.put("/musteri/:id", async (c) => {
  const sahipId = c.get("kullaniciId" as never) as number;
  const id = parseInt(c.req.param("id"), 10);
  const body = await c.req.json<MusteriInput>().catch(() => null);
  if (!body || !body.ad) return c.json({ hata: "Geçersiz body" }, 422);
  const r = await c.env.DB.prepare(
    `UPDATE musteri SET ad = ?, telefon = ?, email = ?, notlar = ?, etiketler = ?, guncellendi = ?
     WHERE id = ? AND sahip_id = ?`,
  ).bind(
    body.ad,
    body.telefon ?? null,
    body.email ?? null,
    body.notlar ?? null,
    body.etiketler?.join(",") ?? null,
    Date.now(),
    id,
    sahipId,
  ).run();
  if ((r.meta?.changes ?? 0) === 0) return c.json({ hata: "Bulunamadı" }, 404);
  return c.json({ ok: true });
});

crmRoutes.delete("/musteri/:id", async (c) => {
  const sahipId = c.get("kullaniciId" as never) as number;
  const id = parseInt(c.req.param("id"), 10);
  await c.env.DB.prepare(
    `DELETE FROM musteri WHERE id = ? AND sahip_id = ?`,
  ).bind(id, sahipId).run();
  return c.json({ ok: true });
});

// ── PARSEL ATAMA ──────────────────────────────────────────────────────────────

crmRoutes.get("/musteri/:id/parsel", async (c) => {
  const sahipId = c.get("kullaniciId" as never) as number;
  const musteriId = parseInt(c.req.param("id"), 10);
  // Müşteri sahibi kontrolü
  const m = await c.env.DB.prepare(
    `SELECT id FROM musteri WHERE id = ? AND sahip_id = ?`,
  ).bind(musteriId, sahipId).first();
  if (!m) return c.json({ hata: "Bulunamadı" }, 404);

  const rows = await c.env.DB.prepare(
    `SELECT id, il_norm, ilce_norm, mahalle_norm, ada_no, parsel_no, alan_m2,
            fiyat_tahmin_tlm2, not_text, durum, olusturuldu
     FROM musteri_parsel WHERE musteri_id = ? ORDER BY olusturuldu DESC`,
  ).bind(musteriId).all();
  return c.json({ parseller: rows.results ?? [] });
});

crmRoutes.post("/musteri/:id/parsel", async (c) => {
  const sahipId = c.get("kullaniciId" as never) as number;
  const musteriId = parseInt(c.req.param("id"), 10);
  const m = await c.env.DB.prepare(
    `SELECT id FROM musteri WHERE id = ? AND sahip_id = ?`,
  ).bind(musteriId, sahipId).first();
  if (!m) return c.json({ hata: "Müşteri bulunamadı" }, 404);

  const body = await c.req.json<ParselAtamaInput>().catch(() => null);
  if (!body) return c.json({ hata: "Geçersiz body" }, 422);

  await c.env.DB.prepare(
    `INSERT INTO musteri_parsel (musteri_id, il_norm, ilce_norm, mahalle_norm,
       ada_no, parsel_no, alan_m2, fiyat_tahmin_tlm2, not_text, olusturuldu)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    musteriId,
    body.il_norm ?? null,
    body.ilce_norm ?? null,
    body.mahalle_norm ?? null,
    body.ada_no ?? null,
    body.parsel_no ?? null,
    body.alan_m2 ?? null,
    body.fiyat_tahmin_tlm2 ?? null,
    body.not_text ?? null,
    Date.now(),
  ).run();
  return c.json({ ok: true }, 201);
});

crmRoutes.delete("/atama/:atamaId", async (c) => {
  const sahipId = c.get("kullaniciId" as never) as number;
  const atamaId = parseInt(c.req.param("atamaId"), 10);
  // Sahip kontrolü: atama → müşteri → sahip_id
  const a = await c.env.DB.prepare(
    `SELECT mp.id FROM musteri_parsel mp
     JOIN musteri m ON m.id = mp.musteri_id
     WHERE mp.id = ? AND m.sahip_id = ?`,
  ).bind(atamaId, sahipId).first();
  if (!a) return c.json({ hata: "Bulunamadı" }, 404);
  await c.env.DB.prepare(`DELETE FROM musteri_parsel WHERE id = ?`).bind(atamaId).run();
  return c.json({ ok: true });
});

// ── NOT TIMELINE ──────────────────────────────────────────────────────────────

crmRoutes.get("/musteri/:id/not", async (c) => {
  const sahipId = c.get("kullaniciId" as never) as number;
  const musteriId = parseInt(c.req.param("id"), 10);
  const m = await c.env.DB.prepare(
    `SELECT id FROM musteri WHERE id = ? AND sahip_id = ?`,
  ).bind(musteriId, sahipId).first();
  if (!m) return c.json({ hata: "Bulunamadı" }, 404);
  const rows = await c.env.DB.prepare(
    `SELECT id, parsel_atama_id, metin, ts FROM musteri_not
     WHERE musteri_id = ? ORDER BY ts DESC LIMIT 100`,
  ).bind(musteriId).all();
  return c.json({ notlar: rows.results ?? [] });
});

crmRoutes.post("/musteri/:id/not", async (c) => {
  const sahipId = c.get("kullaniciId" as never) as number;
  const musteriId = parseInt(c.req.param("id"), 10);
  const m = await c.env.DB.prepare(
    `SELECT id FROM musteri WHERE id = ? AND sahip_id = ?`,
  ).bind(musteriId, sahipId).first();
  if (!m) return c.json({ hata: "Bulunamadı" }, 404);

  const body = await c.req.json<NotInput>().catch(() => null);
  if (!body?.metin || body.metin.trim().length < 2) {
    return c.json({ hata: "Metin zorunlu" }, 422);
  }
  await c.env.DB.prepare(
    `INSERT INTO musteri_not (musteri_id, parsel_atama_id, metin, ts)
     VALUES (?, ?, ?, ?)`,
  ).bind(musteriId, body.parsel_atama_id ?? null, body.metin.trim(), Date.now()).run();
  return c.json({ ok: true }, 201);
});
