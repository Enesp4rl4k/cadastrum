/**
 * Statik paket — günde bir hesap, sabit il listesi.
 *
 * NEDEN: site her push'ta build ediliyor (günde 10-15). Paket hesabı build
 * başına ~200-300k D1 okuması; önbelleksiz günde 3-4,5M — bütçenin tamamı.
 *
 * MUTASYON: statik.ts'de `if (kayit) { return new Response(… "HIT" …) }`
 * bloğunu kaldır → 1. test kırılır (ikinci çağrı da D1'i sorgular).
 */
import { describe, it, expect } from "vitest";
import { app } from "../src/index.js";
import { createMockEnv } from "./test-helper.js";
import { paketGunu } from "../src/routes/statik.js";

function sayanKv(): KVNamespace {
  const m = new Map<string, string>();
  return {
    get: async (k: string) => m.get(k) ?? null,
    put: async (k: string, v: string) => { m.set(k, v); },
  } as unknown as KVNamespace;
}

function sorguSay(env: ReturnType<typeof createMockEnv>) {
  const sayac = { n: 0 };
  const db = env.DB as unknown as { prepare: (sql: string) => unknown };
  const asil = db.prepare.bind(db);
  db.prepare = (sql: string) => { sayac.n++; return asil(sql); };
  return sayac;
}

describe("statik paket önbelleği", () => {
  it("aynı gün ikinci build D1'e HİÇ sorgu atmaz, yanıt aynı", async () => {
    const env = createMockEnv({ RATE_LIMIT_KV: sayanKv() });
    const sayac = sorguSay(env);

    const r1 = await app.request("/v1/statik/il/istanbul?kategori=arsa", { method: "GET" }, env);
    expect(r1.status).toBe(200);
    expect(r1.headers.get("X-Statik-Onbellek")).toBe("MISS");
    const ilkSorgu = sayac.n;
    expect(ilkSorgu).toBeGreaterThan(0);

    const r2 = await app.request("/v1/statik/il/istanbul?kategori=arsa", { method: "GET" }, env);
    expect(r2.headers.get("X-Statik-Onbellek")).toBe("HIT");
    expect(sayac.n).toBe(ilkSorgu);
    expect(await r2.text()).toBe(await r1.text());
  });

  it("81 il listesinde olmayan il 400 — anahtar uzayı sınırlı, D1'e gitmez", async () => {
    const env = createMockEnv({ RATE_LIMIT_KV: sayanKv() });
    const sayac = sorguSay(env);
    const r = await app.request("/v1/statik/il/uydurma-il?kategori=arsa", { method: "GET" }, env);
    expect(r.status).toBe(400);
    const k = await app.request("/v1/statik/il/istanbul?kategori=konut", { method: "GET" }, env);
    expect(k.status).toBe(400);
    expect(sayac.n).toBe(0);
  });

  it("paket günü 03:30 UTC'de döner — cron (03:00) öncesi build dünkü paketi kullanır", () => {
    expect(paketGunu(Date.UTC(2026, 8, 14, 3, 29))).toBe("2026-09-13");
    expect(paketGunu(Date.UTC(2026, 8, 14, 3, 31))).toBe("2026-09-14");
  });
});
