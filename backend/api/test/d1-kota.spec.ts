/**
 * D1 günlük kotası dolunca: 503 + Retry-After, ve istek başına hata kaydı YOK.
 *
 * NEDEN (2026-09-13): kota olayı opak 500 dönüyordu ve her başarısız istek
 * önce D1'e, sonra KV'ye hata kaydı yazmaya çalışıyordu. KV ücretsiz katmanda
 * günde 1.000 yazma — yoğun trafikte kota olayı KV'yi de tüketirdi.
 *
 * MUTASYON: index.ts onError'daki `if (d1KotaHatasiMi(err)) { … }` dalını
 * kaldır → 1. test kırılır (500 döner, KV'ye yazar).
 */
import { describe, it, expect } from "vitest";
import { app } from "../src/index.js";
import { createMockEnv } from "./test-helper.js";
import { d1KotaHatasiMi, kotaSifirlanmasinaSaniye } from "../src/lib/d1-kota.js";

const KOTA_HATASI =
  "D1_ERROR: Your account has exceeded D1's free tier daily row read limit. Upgrade to a paid plan or wait until tomorrow (midnight UTC) to continue.";

function kotasiDolmusEnv() {
  const yazilan: string[] = [];
  const kv = {
    get: async () => null,
    put: async (k: string) => { yazilan.push(k); },
    delete: async () => {},
  } as unknown as KVNamespace;
  const env = createMockEnv({ RATE_LIMIT_KV: kv });
  const db = env.DB as unknown as { prepare: (sql: string) => unknown };
  db.prepare = () => { throw new Error(KOTA_HATASI); };
  return { env, yazilan };
}

describe("D1 kota hatası", () => {
  it("503 + Retry-After + GUNLUK_KOTA_DOLDU, ve hata kaydı için KV'ye YAZILMAZ", async () => {
    const { env, yazilan } = kotasiDolmusEnv();
    const r = await app.request("/v1/harita/ozet?analizTip=1", { method: "GET" }, env);
    expect(r.status).toBe(503);
    expect(Number(r.headers.get("Retry-After"))).toBeGreaterThanOrEqual(60);
    const g = await r.json() as { error: { code: string } };
    expect(g.error.code).toBe("GUNLUK_KOTA_DOLDU");
    // İstek sınırlayıcının sayaç anahtarları (rl:…) hariç: hata kaydı yazılmamalı.
    expect(yazilan.filter((k) => !k.startsWith("rl:"))).toEqual([]);
  });

  it("kota dışı hatalar hâlâ 500 — her şeyi 503'e çevirmiyoruz", () => {
    expect(d1KotaHatasiMi(new Error("D1_ERROR: no such table: x"))).toBe(false);
    expect(d1KotaHatasiMi(new Error(KOTA_HATASI))).toBe(true);
    expect(d1KotaHatasiMi(new Error("exceeded D1's free tier daily row write limit"))).toBe(true);
  });

  it("Retry-After bir sonraki 00:00 UTC'ye kadar", () => {
    const simdi = Date.UTC(2026, 8, 13, 22, 0, 0); // 22:00 UTC → 2 saat
    expect(kotaSifirlanmasinaSaniye(simdi)).toBe(2 * 60 * 60);
    // Gece yarısına saniyeler kala sıfır yazmıyor.
    expect(kotaSifirlanmasinaSaniye(Date.UTC(2026, 8, 13, 23, 59, 59))).toBe(60);
  });
});
