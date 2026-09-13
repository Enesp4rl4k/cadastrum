/**
 * Doğrulama raporu önbelleği — kimliksiz uçlar ilan tablosunu TEKRAR taramaz.
 *
 * NEDEN (2026-09-13, `wrangler d1 insights`): /validation/public ve /bias her
 * çağrıda 90 günlük tüm ilanları okuyordu — 97 çağrı × 47.164 satır = 4,57M,
 * günlük 5M okuma limitinin %91'i. Limit ~13 saatte doluyor, sitenin tüm veri
 * uçları 500 dönüyordu. Kimliksiz olduğu için DoS açığıydı da.
 *
 * ── SAYAN KV ve SAYAN DB ŞART ──────────────────────────────────────────────
 * test-helper'ın varsayılan KV'si `get` için hep null döndürüyor: önbellek
 * testte HİÇ tutmaz ve "2. istek taramadı" testi yazılamaz. DB tarafında da
 * ilan tablosuna giden sorgular sayılıyor — sonucun doğru olması değil,
 * TARAMANIN TEKRARLANMAMASI ölçülüyor.
 *
 * MUTASYON: validation.ts'deki `biasRaporuGetir` içinde `if (kayit) return …`
 * satırını kaldır → 1. test kırılır (ikinci çağrı da tarar).
 */
import { describe, it, expect } from "vitest";
import { app } from "../src/index.js";
import { createMockEnv } from "./test-helper.js";

function sayanKv(): KVNamespace {
  const m = new Map<string, string>();
  return {
    get: async (k: string) => m.get(k) ?? null,
    put: async (k: string, v: string) => { m.set(k, v); },
  } as unknown as KVNamespace;
}

/** env.DB.prepare'i sarar; ilan tablosunu okuyan SELECT'leri sayar. */
function ilanTaramasiSay(env: ReturnType<typeof createMockEnv>) {
  const sayac = { n: 0 };
  const db = env.DB as unknown as { prepare: (sql: string) => unknown };
  const asil = db.prepare.bind(db);
  db.prepare = (sql: string) => {
    if (/FROM\s+ilanlar/i.test(sql) && /yakalanma_tarihi\s*>=/.test(sql)) sayac.n++;
    return asil(sql);
  };
  return sayac;
}

describe("doğrulama raporu önbelleği", () => {
  it("kimliksiz uçlara 20 istek → ilan tablosu YALNIZCA BİR KEZ taranır", async () => {
    const env = createMockEnv({ RATE_LIMIT_KV: sayanKv() });
    const sayac = ilanTaramasiSay(env);
    for (let i = 0; i < 10; i++) {
      const a = await app.request("/v1/validation/public", { method: "GET" }, env);
      const b = await app.request("/v1/validation/bias", { method: "GET" }, env);
      expect(a.status).toBe(200);
      expect(b.status).toBe(200);
    }
    expect(sayac.n).toBe(1);
  });

  it("/public ve /bias AYNI raporu okuyor — biri önbelleği doldurunca diğeri taramıyor", async () => {
    const env = createMockEnv({ RATE_LIMIT_KV: sayanKv() });
    const sayac = ilanTaramasiSay(env);
    const pub = await (await app.request("/v1/validation/public", { method: "GET" }, env)).json() as { olusturuldu: number };
    const bias = await (await app.request("/v1/validation/bias", { method: "GET" }, env)).json() as { olusturuldu: number };
    expect(sayac.n).toBe(1);
    expect(bias.olusturuldu).toBe(pub.olusturuldu);
  });
});
