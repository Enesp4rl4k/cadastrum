/**
 * Harita istek sınırı — statik uç sınırlanmaz, D1 uçları korunur.
 *
 * NEDEN: tüm /v1/harita/* saatte 30 isteği paylaşıyordu; harita sayfası
 * görünen her ilçe için ayrı istek attığından ilk açılışta ~30 istekten
 * sonra her şey 429 alıyor ve sayfa boş kalıyordu (2026-07-16'dan beri).
 * /harita/likidite D1'e hiç dokunmuyor — sınırlanması yalnızca sayfayı
 * bozuyordu.
 *
 * ── SAYAN KV ŞART ──────────────────────────────────────────────────────────
 *
 * test-helper'ın varsayılan KV'si `get` için hep null döndürüyor, `put` hiçbir
 * şey yapmıyor — yani sınırlayıcı testlerde HİÇ SAYMIYOR. Bu dosyanın ilk
 * sürümü onunla yazıldı: "40 istek → hepsi 200" testi, muafiyet olmasa BİLE
 * geçiyordu (tautoloji), "301. istek 429" testi ise hiç 429 görmedi. Burada
 * gerçekten sayan, bellekte bir KV veriliyor.
 *
 * MUTASYON: index.ts'deki `if (c.req.path === "/v1/harita/likidite") return next();`
 * satırını kaldır → ilk test kırılır (31. istekte 429 değil 301. istekte;
 * sınır 300 olduğundan 40 istek yetmez — bu yüzden test 310 istek atıyor).
 */
import { describe, it, expect } from "vitest";
import { app } from "../src/index.js";
import { createMockEnv } from "./test-helper.js";

/** Gerçekten sayan bellek içi KV — sınırlayıcının get → +1 → put döngüsü için. */
function sayanKv(): KVNamespace {
  const m = new Map<string, string>();
  return {
    get: async (k: string) => m.get(k) ?? null,
    put: async (k: string, v: string) => { m.set(k, v); },
  } as unknown as KVNamespace;
}

describe("harita istek sınırı", () => {
  it("statik /harita/likidite sınırlanmaz — D1 sınırının (300) üstünde bile", async () => {
    const env = createMockEnv({ RATE_LIMIT_KV: sayanKv() });
    for (let i = 0; i < 310; i++) {
      const r = await app.request("/v1/harita/likidite?kategori=arsa", { method: "GET" }, env);
      expect(r.status, `${i + 1}. istek`).toBe(200);
    }
  });

  it("D1 uçları hâlâ sınırlı — 301. istek 429 (koruma kalkmadı, yalnızca yükseldi)", async () => {
    const env = createMockEnv({ RATE_LIMIT_KV: sayanKv() });
    let ilk429 = -1;
    for (let i = 0; i < 310; i++) {
      const r = await app.request("/v1/harita/ozet?analizTip=1&birlesik=1", { method: "GET" }, env);
      if (r.status === 429) { ilk429 = i + 1; break; }
    }
    expect(ilk429).toBe(301);
  });

  it("likidite istekleri D1 uçlarının sayacını TÜKETMEZ", async () => {
    const env = createMockEnv({ RATE_LIMIT_KV: sayanKv() });
    for (let i = 0; i < 50; i++) {
      await app.request("/v1/harita/likidite?kategori=arsa", { method: "GET" }, env);
    }
    const r = await app.request("/v1/harita/ozet?analizTip=1&birlesik=1", { method: "GET" }, env);
    expect(r.headers.get("X-RateLimit-Remaining")).toBe("299");
  });
});
