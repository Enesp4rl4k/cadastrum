/**
 * Cadex Fiyat Endeksi — In-memory test suite
 */
import { describe, it, expect } from "vitest";
import { app } from "../src/index.js";
import { createMockEnv } from "./test-helper.js";
import { endeksHesapla } from "../src/routes/endeks.js";

describe("Cadex Fiyat Endeksi API", () => {
  const env = createMockEnv();

  it("GET /v1/api/endeks → boş veride 200 döner", async () => {
    const res = await app.request("/v1/api/endeks", { method: "GET" }, env);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.kategori).toBe("arsa");
    expect(Array.isArray(body.noktalar)).toBe(true);
  });

  it("endeksHesapla() ilanlardan fiyat_endeksi tablosunu besler", async () => {
    // İlan ekle
    await env.DB.prepare(`
      INSERT INTO ilanlar (kaynak, ilan_no, il_norm, ilce_norm, kategori, fiyat_per_m2, yakalanma_tarihi)
      VALUES
        ('sahibinden', 'endeks-101', 'istanbul', 'kadikoy', 'arsa', 25000, unixepoch()),
        ('sahibinden', 'endeks-102', 'istanbul', 'beykoz', 'arsa', 15000, unixepoch()),
        ('sahibinden', 'endeks-103', 'ankara', 'cankaya', 'arsa', 10000, unixepoch())
    `).run();

    const hesap = await endeksHesapla(env.DB);
    expect(hesap.hesaplanan).toBeGreaterThanOrEqual(1);

    // Endeks tablosunu doğrula
    const endeksRows = await env.DB.prepare(
      "SELECT * FROM fiyat_endeksi WHERE il_norm = 'istanbul' AND kategori = 'arsa'"
    ).all();
    expect(endeksRows.results.length).toBeGreaterThan(0);
    expect((endeksRows.results[0] as any).medyan).toBe(20000); // AVG(25000, 15000)
  });
});
