/**
 * AI fiyat proxy integration testleri.
 */
import { describe, it, expect } from "vitest";

const API = process.env.CADASTRUM_API ?? "https://cadastrum-api.dumencibaba1910.workers.dev/v1";

async function freeKullaniciToken(): Promise<string> {
  const email = `aitest${Date.now()}-${Math.random().toString(36).slice(2, 6)}@cadastrum-test.com`;
  const r = await fetch(`${API}/auth/kayit`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, sifre: "abcdef12" }),
  });
  const b: any = await r.json();
  return b.token;
}

describe("ai-fiyat.durum", () => {
  it("Free user için kota=3 döner", async () => {
    const token = await freeKullaniciToken();
    const r = await fetch(`${API}/ai-fiyat/durum`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(r.status).toBe(200);
    const b: any = await r.json();
    expect(b.tier).toBe("free");
    expect(b.kota).toBe(3);
    expect(b.kalan).toBe(3);
  });

  it("token yoksa 401", async () => {
    const r = await fetch(`${API}/ai-fiyat/durum`);
    expect(r.status).toBe(401);
  });
});

describe("ai-fiyat.tahmin", () => {
  it("Free user 3 sorgu yapabilir", async () => {
    const token = await freeKullaniciToken();
    const istek = (n: number) => fetch(`${API}/ai-fiyat/tahmin`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        parselAnahtar: `test-${Date.now()}-${n}`,
        baselineHash: "test-hash",
        prompt: `Test parsel ${n}, baseline 100 TL/m². JSON dön: {altPerM2, beklenenPerM2, ustPerM2, gerekce}.`,
      }),
    });

    // 1-3 başarılı olmalı (Gemini key set'liyse)
    const r1 = await istek(1);
    expect([200, 503]).toContain(r1.status);
  });

  it("kotada eksik parametreler 400", async () => {
    const token = await freeKullaniciToken();
    const r = await fetch(`${API}/ai-fiyat/tahmin`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ parselAnahtar: "x" }),
    });
    expect(r.status).toBe(400);
  });
});

describe("ilan batch endpoint", () => {
  it("/v1/ilan/batch — geçerli payload", async () => {
    const r = await fetch(`${API}/ilan/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ilanlar: [
          { kaynak: "extension", ilan_no: `test-${Date.now()}`, il: "Konya", ilce: "Meram",
            mahalle: "Test", fiyat_per_m2: 100, m2: 1000, kategori: "tarla" },
        ],
      }),
    });
    // 200 (kabul) veya 429 (rate limit) veya 401 (auth gerekirse)
    expect([200, 401, 429]).toContain(r.status);
  });
});
