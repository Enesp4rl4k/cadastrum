/**
 * /v1/statik/harita — harita sayfasının HER ziyarette zorunlu ilk yükünü
 * (özet + ilçe merkezleri) ve iki opsiyonel katmanı tek pakette toplar.
 *
 * NEDEN: Workers ücretsiz planı günde 100.000 İSTEK ile sınırlı — D1
 * bütçesinden ayrı, kod optimizasyonuyla kaldırılamayan bir platform tavanı.
 * /harita/ozet + /harita/ilceler her ziyarette tetikleniyordu.
 *
 * MUTASYONLAR:
 *  - statik-harita.ts'de `if (kayit) { return … "HIT" … }` bloğunu kaldır →
 *    1. test kırılır (ikinci çağrı da dahili istek atar)
 *  - ANALIZ_TIPLERI'nden bir tip çıkar → 2. test kırılır (paket ↔ canlı ayrışır)
 */
import { describe, it, expect } from "vitest";
import { app } from "../src/index.js";
import { createMockEnv } from "./test-helper.js";
import { haritaPaketiKur } from "../src/routes/statik-harita.js";

function sayanKv(): KVNamespace {
  const m = new Map<string, string>();
  return {
    get: async (k: string) => m.get(k) ?? null,
    put: async (k: string, v: string) => { m.set(k, v); },
  } as unknown as KVNamespace;
}

const yurutmeBaglami: ExecutionContext = {
  waitUntil: () => {},
  passThroughOnException: () => {},
} as unknown as ExecutionContext;

describe("statik harita paketi — günlük önbellek", () => {
  it("aynı gün ikinci istek dahili çağrı ATMAZ, gövde aynı", async () => {
    const env = createMockEnv({ RATE_LIMIT_KV: sayanKv() });
    const say = { n: 0 };
    const db = env.DB as unknown as { prepare: (sql: string) => unknown };
    const asil = db.prepare.bind(db);
    db.prepare = (sql: string) => { say.n++; return asil(sql); };

    const r1 = await app.request("/v1/statik/harita", {}, env, yurutmeBaglami);
    expect(r1.status).toBe(200);
    expect(r1.headers.get("X-Statik-Onbellek")).toBe("MISS");
    const ilkSorgu = say.n;
    expect(ilkSorgu).toBeGreaterThan(0);

    const r2 = await app.request("/v1/statik/harita", {}, env, yurutmeBaglami);
    expect(r2.headers.get("X-Statik-Onbellek")).toBe("HIT");
    expect(say.n).toBe(ilkSorgu);
    expect(await r2.text()).toBe(await r1.text());
  });
});

describe("statik harita paketi ↔ canlı rota eşdeğerliği", () => {
  it("5 analizTip'in tamamı pakette; her biri canlı /harita/ozet ile birebir", async () => {
    const env = createMockEnv();
    const paket = await haritaPaketiKur(env, yurutmeBaglami);
    expect(Object.keys(paket.ozet).sort()).toEqual(["1", "2", "3", "4", "5"]);
    for (const tip of [1, 2, 3, 4, 5]) {
      const c = await app.request(`/v1/harita/ozet?analizTip=${tip}`, {}, env, yurutmeBaglami);
      expect(await c.json()).toEqual(paket.ozet[tip]);
    }
  });

  it("ilçeler, gelişen bölgeler ve iki trend kategorisi canlıyla birebir", async () => {
    const env = createMockEnv();
    const paket = await haritaPaketiKur(env, yurutmeBaglami);

    const ilceler = await app.request("/v1/harita/ilceler?v=2", {}, env, yurutmeBaglami);
    expect(await ilceler.json()).toEqual(paket.ilceler);

    const gelisen = await app.request("/v1/harita/gelisen-bolgeler", {}, env, yurutmeBaglami);
    // `guncelleme` handler içinde `new Date().toISOString()` ile ÇAĞRI ANINDA
    // üretiliyor — iki ayrı istek arasında birkaç ms fark tautolojik olarak
    // beklenir, veri sapması değil. Alan hariç karşılaştırılıyor.
    const gelisenGovde = await gelisen.json() as Record<string, unknown>;
    const { guncelleme: g1, ...gelisenKalan } = gelisenGovde;
    const { guncelleme: g2, ...paketKalan } = paket.gelisenBolgeler as Record<string, unknown>;
    expect(gelisenKalan).toEqual(paketKalan);
    expect(typeof g1).toBe(typeof g2);

    for (const kat of ["arsa", "tarla"] as const) {
      const t = await app.request(`/v1/harita/trend?kategori=${kat}`, {}, env, yurutmeBaglami);
      expect(await t.json()).toEqual(paket.trend[kat]);
    }
  });

  it("dahili çağrı sayısı D1'in çağrı başına 50 sorgu sınırının çok altında", async () => {
    const env = createMockEnv();
    const say = { n: 0 };
    const db = env.DB as unknown as { prepare: (sql: string) => unknown };
    const asil = db.prepare.bind(db);
    db.prepare = (sql: string) => { say.n++; return asil(sql); };
    await haritaPaketiKur(env, yurutmeBaglami);
    expect(say.n).toBeLessThanOrEqual(12);
  });
});
