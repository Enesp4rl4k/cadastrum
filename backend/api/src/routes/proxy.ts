/**
 * Dış servisler için CORS proxy.
 *
 * Mevcut endpoint'ler:
 *   GET /v1/proxy/eplan?ilceKodu=&mahalleKodu=&adaNo=&parselNo=
 *
 * NOT (S1.4): AFAD TDTH proxy'si kaldırıldı. Sebep: AFAD'ın public API'si
 * stabil değil, /api/v1/sismik/ endpoint'i 404 dönüyor. Mevcut il-bazlı
 * IL_DEPREM tablosu (src/lib/data/deprem-zonlari.ts) 81 il PGA değerleri
 * ile yeterli kalite veriyor. Koord-bazlı PGA gelecekte resmi API çıkarsa
 * eklenebilir.
 */
import { Hono } from "hono";
import type { Env } from "../index.js";

export const proxyRoutes = new Hono<{ Bindings: Env }>();

// ── e-Plan (imar) ─────────────────────────────────────────────────────────────
// Şu an mevcut e-plan-api'ye doğrudan proxy.
// URL: https://e-plan.gov.tr/...

proxyRoutes.get("/eplan", async (c) => {
  const ilceKodu = c.req.query("ilceKodu");
  const mahalleKodu = c.req.query("mahalleKodu");
  const adaNo = c.req.query("adaNo");
  const parselNo = c.req.query("parselNo");
  if (!ilceKodu || !mahalleKodu || !adaNo || !parselNo) {
    return c.json({ error: "ilceKodu, mahalleKodu, adaNo, parselNo zorunlu" }, 400);
  }
  // Validation — sadece numeric/UUID
  if (
    !/^\d+$/.test(ilceKodu) || !/^\d+$/.test(mahalleKodu) ||
    !/^\d+$/.test(adaNo) || !/^\d+$/.test(parselNo)
  ) {
    return c.json({ error: "Tüm parametreler numeric olmalı" }, 400);
  }

  const url = `https://e-plan.gov.tr/proxy/parselSorgu?ilceKodu=${ilceKodu}&mahalleKodu=${mahalleKodu}&adaNo=${adaNo}&parselNo=${parselNo}`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Cadastrum/1.0)",
        Accept: "application/json, text/html, */*",
      },
      cf: { cacheTtl: 86_400, cacheEverything: true } as never,
    });
    if (!res.ok) {
      return c.json({ error: `e-Plan ${res.status}`, status: res.status }, 502);
    }
    const text = await res.text();
    return new Response(text, {
      status: 200,
      headers: {
        "Content-Type": res.headers.get("Content-Type") ?? "text/html",
        "Cache-Control": "public, max-age=86400",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
});

// ── Sağlık ────────────────────────────────────────────────────────────────────

proxyRoutes.get("/health", (c) =>
  c.json({ ok: true, services: ["afad-tdth", "eplan"] }),
);
