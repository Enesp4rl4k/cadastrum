/**
 * Harita endpoint'leri — TKGM analiz verisi D1'den okunur.
 *
 * Veri tek seferlik scripts/tkgm-analiz-seed.mjs ile seed edilir.
 * Site buradan okur; TKGM'ye doğrudan hiç istek atmaz.
 *
 * GET /v1/harita/analiz?ilceKodu=XXX&analizTip=1&yil=2024
 *   → Tek ilçe, tek tip, tek yıl noktaları
 *
 * GET /v1/harita/analiz/birlesik?ilceKodu=XXX&analizTip=1
 *   → Tek ilçe, tek tip, tüm yıllar birleşik (parsel bazında sum)
 *
 * GET /v1/harita/ozet?analizTip=1&yil=2024
 *   → Tüm ilçelerin özet sayıları (harita renklendirme için)
 *
 * GET /v1/harita/seed-status
 *   → Kaç ilçe/tip/yıl seed edilmiş (admin/debug için)
 */

import { Hono } from "hono";
import type { Env } from "../index.js";

export const haritaRoutes = new Hono<{ Bindings: Env }>();

const VALID_TIP = new Set([1, 2, 3, 4, 5]);
const YIL_MIN = 2003;
const YIL_MAX = new Date().getFullYear();

// ── Tek ilçe / tek yıl noktaları ──────────────────────────────────────────────

haritaRoutes.get("/analiz", async (c) => {
  const ilceKodu  = Number(c.req.query("ilceKodu"));
  const analizTip = Number(c.req.query("analizTip"));
  const yil       = Number(c.req.query("yil"));

  if (!ilceKodu || !VALID_TIP.has(analizTip)) {
    return c.json({ error: "ilceKodu ve analizTip (1–5) zorunlu" }, 400);
  }
  if (yil && (yil < YIL_MIN || yil > YIL_MAX)) {
    return c.json({ error: `yil ${YIL_MIN}–${YIL_MAX} arasında olmalı` }, 400);
  }

  const hedefYil = yil || (YIL_MAX - 1);

  const rows = await c.env.DB.prepare(
    `SELECT parsel_id, enlem, boylam, sayi
     FROM tkgm_analiz_noktalari
     WHERE ilce_kodu = ? AND analiz_tip = ? AND yil = ?
     LIMIT 5000`
  ).bind(ilceKodu, analizTip, hedefYil).all<{
    parsel_id: number; enlem: number; boylam: number; sayi: number;
  }>();

  return c.json(
    { ilceKodu, analizTip, yil: hedefYil, noktalar: rows.results ?? [] },
    200,
    { "Cache-Control": "public, max-age=604800" }, // 7 gün
  );
});

// ── Tek ilçe / tüm yıllar birleşik (parsel bazında sum) ───────────────────────

haritaRoutes.get("/analiz/birlesik", async (c) => {
  const ilceKodu  = Number(c.req.query("ilceKodu"));
  const analizTip = Number(c.req.query("analizTip"));

  if (!ilceKodu || !VALID_TIP.has(analizTip)) {
    return c.json({ error: "ilceKodu ve analizTip (1–5) zorunlu" }, 400);
  }

  // Tüm yılları parsel bazında topla — D1 bunu single query ile halleder
  const rows = await c.env.DB.prepare(
    `SELECT parsel_id, enlem, boylam, SUM(sayi) AS sayi
     FROM tkgm_analiz_noktalari
     WHERE ilce_kodu = ? AND analiz_tip = ?
     GROUP BY parsel_id
     LIMIT 5000`
  ).bind(ilceKodu, analizTip).all<{
    parsel_id: number; enlem: number; boylam: number; sayi: number;
  }>();

  return c.json(
    { ilceKodu, analizTip, mod: "birlesik", noktalar: rows.results ?? [] },
    200,
    { "Cache-Control": "public, max-age=604800" },
  );
});

// ── Tüm ilçelerin özet sayıları ────────────────────────────────────────────────

haritaRoutes.get("/ozet", async (c) => {
  const analizTip = Number(c.req.query("analizTip") ?? "1");
  const yilRaw    = c.req.query("yil");
  const birlesik  = c.req.query("birlesik") === "1";

  if (!VALID_TIP.has(analizTip)) {
    return c.json({ error: "analizTip 1–5 olmalı" }, 400);
  }

  let rows;
  if (birlesik) {
    // Tüm yıllar toplamı
    rows = await c.env.DB.prepare(
      `SELECT ilce_kodu, SUM(nokta_sayisi) AS nokta_sayisi, SUM(toplam_islem) AS toplam_islem
       FROM tkgm_analiz_ozet
       WHERE analiz_tip = ?
       GROUP BY ilce_kodu`
    ).bind(analizTip).all<{
      ilce_kodu: number; nokta_sayisi: number; toplam_islem: number;
    }>();
  } else {
    const yil = yilRaw ? Number(yilRaw) : (YIL_MAX - 1);
    rows = await c.env.DB.prepare(
      `SELECT ilce_kodu, nokta_sayisi, toplam_islem
       FROM tkgm_analiz_ozet
       WHERE analiz_tip = ? AND yil = ?`
    ).bind(analizTip, yil).all<{
      ilce_kodu: number; nokta_sayisi: number; toplam_islem: number;
    }>();
  }

  return c.json(
    { analizTip, birlesik, ozet: rows.results ?? [] },
    200,
    { "Cache-Control": "public, max-age=3600" }, // 1 saat
  );
});

// ── Seed durumu (debug/admin) ──────────────────────────────────────────────────

haritaRoutes.get("/seed-status", async (c) => {
  const [ilceCount, tipYilCount, sonSeed] = await Promise.all([
    c.env.DB.prepare(
      `SELECT COUNT(DISTINCT ilce_kodu) AS n FROM tkgm_analiz_ozet`
    ).first<{ n: number }>(),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM tkgm_analiz_ozet`
    ).first<{ n: number }>(),
    c.env.DB.prepare(
      `SELECT MAX(seed_at) AS t FROM tkgm_analiz_ozet`
    ).first<{ t: number | null }>(),
  ]);

  return c.json({
    ilceSayisi: ilceCount?.n ?? 0,
    tipYilKombinasyon: tipYilCount?.n ?? 0,
    sonSeedAt: sonSeed?.t ? new Date(sonSeed.t).toISOString() : null,
  });
});
