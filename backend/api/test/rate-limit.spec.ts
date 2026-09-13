/**
 * İstek sınırı — Cloudflare Rate Limiting binding'i, KV'ye YAZMADAN.
 *
 * NEDEN (2026-09-13): eski sınırlayıcı istek başına KV'ye yazıyordu; ücretsiz
 * KV günde 1.000 yazma — yüksek trafikte sınırlayıcı sessizce kapanıyordu.
 *
 * MUTASYONLAR:
 *  - sinifSec'te `>= 300` → `>= 301` → sınıf tablosu testi kırılır
 *  - wrangler.toml'da SINIR_GENEL limitini 31 yap → eşleşme testi kırılır
 *  - rate-limit.ts'de `if (sayilan.has(onek))` bloğunu kaldır → çift sayım testi kırılır
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { app } from "../src/index.js";
import { createMockEnv } from "./test-helper.js";
import { Hono } from "hono";
import type { Env } from "../src/index.js";
import { sinifSec, SINIF_DAKIKA_LIMIT, rateLimitMiddleware, type SinirSinifi } from "../src/lib/rate-limit.js";

/** Gerçek binding gibi anahtar başına sayan sahte sınırlayıcı. */
function sayanSinirlayici(limit: number) {
  const sayim = new Map<string, number>();
  const cagrilar: string[] = [];
  const binding = {
    limit: async ({ key }: { key: string }) => {
      cagrilar.push(key);
      const n = (sayim.get(key) ?? 0) + 1;
      sayim.set(key, n);
      return { success: n <= limit };
    },
  } as unknown as RateLimit;
  return { binding, sayim, cagrilar };
}

function tumSiniflar() {
  const s = Object.fromEntries(
    (Object.keys(SINIF_DAKIKA_LIMIT) as SinirSinifi[]).map((k) => [k, sayanSinirlayici(SINIF_DAKIKA_LIMIT[k])]),
  ) as Record<SinirSinifi, ReturnType<typeof sayanSinirlayici>>;
  return {
    s,
    bindingler: Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v.binding])),
  };
}

function yazanKv() {
  const yazilan: string[] = [];
  return {
    yazilan,
    kv: {
      get: async () => null,
      put: async (k: string) => { yazilan.push(k); },
      delete: async () => {},
    } as unknown as KVNamespace,
  };
}

describe("sınıf eşlemesi", () => {
  it("mevcut kuralların saatlik niyetleri doğru sınıfa düşüyor", () => {
    expect(sinifSec(600)).toBe("SINIR_YOGUN");
    expect(sinifSec(300)).toBe("SINIR_YOGUN");
    expect(sinifSec(299)).toBe("SINIR_GENEL");
    expect(sinifSec(60)).toBe("SINIR_GENEL");
    expect(sinifSec(59)).toBe("SINIR_DAR");
    expect(sinifSec(20)).toBe("SINIR_DAR");
    expect(sinifSec(19)).toBe("SINIR_PAHALI");
    expect(sinifSec(3)).toBe("SINIR_PAHALI");
  });

  it("wrangler.toml [[ratelimits]] limitleri koddaki tabloyla birebir, pencere 60 sn", () => {
    const toml = readFileSync(join(__dirname, "..", "wrangler.toml"), "utf8");
    const bloklar = [...toml.matchAll(/\[\[ratelimits\]\]\s*\nname\s*=\s*"(\w+)"[\s\S]*?simple\s*=\s*\{\s*limit\s*=\s*(\d+)\s*,\s*period\s*=\s*(\d+)\s*\}/g)];
    const tomlTablo = Object.fromEntries(bloklar.map((b) => [b[1], Number(b[2])]));
    expect(tomlTablo).toEqual(SINIF_DAKIKA_LIMIT);
    for (const b of bloklar) expect(Number(b[3])).toBe(60);
  });
});

describe("sınırlayıcı davranışı", () => {
  it("sınıf limitinden sonra 429 + Retry-After — ve KV'ye HİÇ yazmıyor", async () => {
    const { s, bindingler } = tumSiniflar();
    const { kv, yazilan } = yazanKv();
    const env = createMockEnv({ ...bindingler, RATE_LIMIT_KV: kv });
    const hdr = { "CF-Connecting-IP": "1.2.3.4" };

    // /v1/fiyat/* → rateLimitMiddleware(120) → SINIR_GENEL (30/dk)
    const durumlar: number[] = [];
    for (let i = 0; i < 31; i++) {
      const r = await app.request("/v1/fiyat/il/istanbul?kategori=konut", { headers: hdr }, env);
      durumlar.push(r.status);
      if (i === 30) {
        expect(r.headers.get("Retry-After")).toBe("60");
        expect(r.headers.get("X-RateLimit-Limit")).toBe("30");
      }
    }
    expect(durumlar.slice(0, 30).every((d) => d !== 429)).toBe(true);
    expect(durumlar[30]).toBe(429);
    expect([...s.SINIR_GENEL.sayim.keys()]).toEqual(["fiyat:1.2.3.4"]);
    expect(yazilan.filter((k) => k.startsWith("rl:"))).toEqual([]);
  });

  it("farklı IP'ler birbirinin hakkını tüketmez", async () => {
    const { bindingler } = tumSiniflar();
    const env = createMockEnv(bindingler);
    for (let i = 0; i < 30; i++) {
      await app.request("/v1/fiyat/il/istanbul?kategori=konut", { headers: { "CF-Connecting-IP": "9.9.9.9" } }, env);
    }
    const r = await app.request("/v1/fiyat/il/istanbul?kategori=konut", { headers: { "CF-Connecting-IP": "8.8.8.8" } }, env);
    expect(r.status).not.toBe(429);
  });

  it("aynı istekte aynı önek İKİ KEZ sayılmaz; farklı önekler ayrı sayılır", async () => {
    // Gerçek uygulamada çift önek (takip, api-v2-degerle) kimlik doğrulamasının
    // ARKASINDA — anonim istek ikinci sınırlayıcıya ulaşmıyor. İlk sürüm bu testi
    // /v1/takip üzerinden yazdı ve koruma kaldırılınca bile geçti (tautoloji).
    // Burada iki sınırlayıcı doğrudan art arda takılı.
    const { s, bindingler } = tumSiniflar();
    const env = createMockEnv(bindingler);
    const deneme = new Hono<{ Bindings: Env }>();
    deneme.use("/x/*", rateLimitMiddleware(30, "takip"));
    deneme.use("/x/*", rateLimitMiddleware(30, "takip"));
    deneme.use("/x/*", rateLimitMiddleware(30, "takip-kontrol"));
    deneme.get("/x/y", (c) => c.text("ok"));

    const r = await deneme.request("/x/y", { headers: { "CF-Connecting-IP": "5.5.5.5" } }, env);
    expect(r.status).toBe(200);
    expect(s.SINIR_DAR.cagrilar).toEqual(["takip:5.5.5.5", "takip-kontrol:5.5.5.5"]);
  });

  it("binding yoksa (yerel/test) istek engellenmez", async () => {
    const env = createMockEnv();
    const r = await app.request("/v1/fiyat/il/istanbul?kategori=konut", {}, env);
    expect(r.status).not.toBe(429);
  });

  it("limit() hata verirse istek düşmez", async () => {
    const bozuk = { limit: async () => { throw new Error("binding arızası"); } } as unknown as RateLimit;
    const env = createMockEnv({ SINIR_GENEL: bozuk });
    const r = await app.request("/v1/fiyat/il/istanbul?kategori=konut", {}, env);
    expect(r.status).not.toBe(429);
    expect(r.status).not.toBe(500);
  });
});
