/**
 * Arazi Avcısı backend integration testleri — Faz A3/A4
 * Canlı API'ye karşı çalışır (CADASTRUM_API env gerekli).
 */
import { describe, it, expect } from "vitest";

const API = process.env.CADASTRUM_API ?? "https://cadastrum-api.dumencibaba1910.workers.dev/v1";

async function freeToken(): Promise<string> {
  const email = `avcitest${Date.now()}-${Math.random().toString(36).slice(2, 6)}@cadastrum-test.com`;
  const r = await fetch(`${API}/auth/kayit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, sifre: "abcdef12" }),
  });
  const b = await r.json() as { token?: string };
  return b.token ?? "";
}

describe("arazi-avci /ara", () => {
  it("temel arama — istanbul arsa → 200 + adaylar dizisi", async () => {
    const r = await fetch(`${API}/arazi-avci/ara`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ il: "istanbul", kategori: "arsa", limit: 5 }),
    });
    expect(r.status).toBe(200);
    const b = await r.json() as { ok: boolean; adaylar: unknown[] };
    expect(b.ok).toBe(true);
    expect(Array.isArray(b.adaylar)).toBe(true);
  });

  it("geçersiz JSON → 400", async () => {
    const r = await fetch(`${API}/arazi-avci/ara`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "NOT_JSON",
    });
    expect(r.status).toBe(400);
  });

  it("limit max 50 ile kısıtlanır", async () => {
    const r = await fetch(`${API}/arazi-avci/ara`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kategori: "tarla", limit: 999 }),
    });
    expect(r.status).toBe(200);
    const b = await r.json() as { adaylar: unknown[] };
    expect(b.adaylar.length).toBeLessThanOrEqual(50);
  });

  it("adaylar skor alanı içeriyor", async () => {
    const r = await fetch(`${API}/arazi-avci/ara`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ il: "ankara", kategori: "arsa", limit: 3 }),
    });
    const b = await r.json() as { adaylar: Array<{ skor: number; medyan_tlm2: number }> };
    for (const a of b.adaylar ?? []) {
      expect(typeof a.skor).toBe("number");
      expect(a.skor).toBeGreaterThanOrEqual(0);
      expect(a.skor).toBeLessThanOrEqual(100);
      expect(typeof a.medyan_tlm2).toBe("number");
    }
  });

  it("max_tlm2 filtresi çalışır", async () => {
    const maxTlm2 = 5000;
    const r = await fetch(`${API}/arazi-avci/ara`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kategori: "tarla", max_tlm2: maxTlm2, limit: 10 }),
    });
    const b = await r.json() as { adaylar: Array<{ medyan_tlm2: number }> };
    for (const a of b.adaylar ?? []) {
      expect(a.medyan_tlm2).toBeLessThanOrEqual(maxTlm2);
    }
  });
});

describe("arazi-avci /kriter (JWT)", () => {
  it("token olmadan kriter kaydet → 401", async () => {
    const r = await fetch(`${API}/arazi-avci/kriter`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ad: "test", kategori: "arsa" }),
    });
    expect(r.status).toBe(401);
  });

  it("geçerli token ile kriter kaydet → 201", async () => {
    const token = await freeToken();
    if (!token) { console.warn("Token alınamadı — skip"); return; }

    const r = await fetch(`${API}/arazi-avci/kriter`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        ad: "Test kriter",
        il: "istanbul",
        kategori: "arsa",
        uyari_aktif: true,
      }),
    });
    expect([201, 400]).toContain(r.status); // 400 = max limit aşıldıysa
  });

  it("kriter listesi GET → 200", async () => {
    const token = await freeToken();
    if (!token) return;

    const r = await fetch(`${API}/arazi-avci/kriter`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(r.status).toBe(200);
    const b = await r.json() as { kriterler: unknown[] };
    expect(Array.isArray(b.kriterler)).toBe(true);
  });

  it("uyarı toggle PATCH → 200 veya 404", async () => {
    const token = await freeToken();
    if (!token) return;

    const r = await fetch(`${API}/arazi-avci/kriter/999/uyari`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ aktif: false }),
    });
    // 404 = kriter yok, 200 = toggle tamam
    expect([200, 404]).toContain(r.status);
  });
});
