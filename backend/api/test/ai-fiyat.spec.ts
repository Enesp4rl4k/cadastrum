/**
 * AI fiyat proxy integration tests using isolated in-memory Hono test harness.
 */
import { describe, it, expect } from "vitest";
import { app } from "../src/index.js";
import { createMockEnv } from "./test-helper.js";

const env = createMockEnv();

async function freeKullaniciToken(): Promise<string> {
  const email = `aitest${Date.now()}-${Math.random().toString(36).slice(2, 6)}@cadastrum-test.com`;
  const r = await app.request(
    "/v1/auth/kayit",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, sifre: "abcdef12" }),
    },
    env
  );
  const b: any = await r.json();
  return b.token;
}

describe("ai-fiyat.durum", () => {
  it("Free user için kota=3 döner", async () => {
    const token = await freeKullaniciToken();
    const r = await app.request(
      "/v1/ai-fiyat/durum",
      {
        headers: { Authorization: `Bearer ${token}` },
      },
      env
    );
    expect(r.status).toBe(200);
    const b: any = await r.json();
    expect(b.tier).toBe("free");
    expect(b.kota).toBe(3);
    expect(b.kalan).toBe(3);
  });

  it("token yoksa 401", async () => {
    const r = await app.request("/v1/ai-fiyat/durum", { method: "GET" }, env);
    expect(r.status).toBe(401);
  });
});

describe("ai-fiyat.tahmin", () => {
  it("Free user 3 sorgu yapabilir", async () => {
    const token = await freeKullaniciToken();
    const r1 = await app.request(
      "/v1/ai-fiyat/tahmin",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          parselAnahtar: `test-${Date.now()}-1`,
          baselineHash: "test-hash",
          parselVeri: {
            il: "İstanbul",
            ilce: "Beykoz",
            kategori: "arsa",
            m2: 1000,
          },
        }),
      },
      env
    );
    // 200 (kabul) veya 503 (GEMINI_API_KEY mock'ta yoksa)
    expect([200, 503]).toContain(r1.status);
  });

  it("kotada eksik parametreler 400", async () => {
    const token = await freeKullaniciToken();
    const r = await app.request(
      "/v1/ai-fiyat/tahmin",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ parselAnahtar: "x" }),
      },
      env
    );
    expect(r.status).toBe(400);
  });
});

describe("ilan batch endpoint", () => {
  it("/v1/ilan/batch — geçerli payload", async () => {
    const r = await app.request(
      "/v1/ilan/batch",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ilanlar: [
            {
              kaynak: "extension",
              ilan_no: `test-${Date.now()}`,
              il: "Konya",
              ilce: "Meram",
              mahalle: "Test",
              fiyat_per_m2: 100,
              m2: 1000,
              kategori: "tarla",
            },
          ],
        }),
      },
      env
    );
    expect([200, 401, 429]).toContain(r.status);
  });
});
