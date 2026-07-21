/**
 * AI Danışman backend integration testleri — Faz B3/B4
 * Canlı API'ye karşı çalışır (CADASTRUM_API env gerekli).
 */
import { describe, it, expect } from "vitest";

const API = process.env.CADASTRUM_API ?? "https://cadastrum-api.dumencibaba1910.workers.dev/v1";

async function freeToken(): Promise<string> {
  const email = `danismantest${Date.now()}-${Math.random().toString(36).slice(2, 6)}@cadastrum-test.com`;
  const r = await fetch(`${API}/auth/kayit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, sifre: "abcdef12" }),
  });
  const b = await r.json() as { token?: string };
  return b.token ?? "";
}

describe("ai-danisman.sohbet", () => {
  it("token yoksa 401", async () => {
    const r = await fetch(`${API}/ai-danisman/sohbet`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mesaj: "Merhaba" }),
    });
    expect(r.status).toBe(401);
  });

  it("token var ama mesaj boş → 400", async () => {
    const token = await freeToken();
    if (!token) { console.warn("Token alınamadı — skip"); return; }

    const r = await fetch(`${API}/ai-danisman/sohbet`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ mesaj: "" }),
    });
    expect(r.status).toBe(400);
  });

  it("mesaj 1000 karakteri aşarsa 400", async () => {
    const token = await freeToken();
    if (!token) return;

    const r = await fetch(`${API}/ai-danisman/sohbet`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ mesaj: "a".repeat(1001) }),
    });
    expect(r.status).toBe(400);
  });

  it("geçerli istek → 200 veya 503 (AI key yoksa) veya 429 (kota)", async () => {
    const token = await freeToken();
    if (!token) return;

    const r = await fetch(`${API}/ai-danisman/sohbet`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        mesaj: "Bu arsanın imar durumu nedir?",
        parsel_baglam: {
          il: "İstanbul",
          ilce: "Beykoz",
          kategori: "arsa",
          m2: 1000,
          imar_tipi: "konut",
          emsal: 1.0,
        },
      }),
    });
    expect([200, 503, 429]).toContain(r.status);

    if (r.status === 200) {
      const b = await r.json() as { yanit?: string; modelAd?: string };
      expect(typeof b.yanit).toBe("string");
      expect(b.yanit!.length).toBeGreaterThan(5);
      expect(typeof b.modelAd).toBe("string");
    }
  });

  it("sohbet geçmişi GET → 200", async () => {
    const token = await freeToken();
    if (!token) return;

    const r = await fetch(`${API}/ai-danisman/gecmis`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(r.status).toBe(200);
    const b = await r.json() as { gecmis: unknown[] };
    expect(Array.isArray(b.gecmis)).toBe(true);
  });
});

describe("imar-degisim /sinyal", () => {
  it("il/ilce olmadan → 400", async () => {
    const r = await fetch(`${API}/imar-degisim/sinyal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(r.status).toBe(400);
  });

  it("geçerli il/ilce → 200 + skor + olasılık", async () => {
    const r = await fetch(`${API}/imar-degisim/sinyal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        il: "istanbul",
        ilce: "beykoz",
        imar_tipi: "tarim",
        gelisim_skoru: 40,
      }),
    });
    expect(r.status).toBe(200);
    const b = await r.json() as {
      ok: boolean;
      skor: number;
      olasılik: string;
      bilesenler: unknown[];
    };
    expect(b.ok).toBe(true);
    expect(typeof b.skor).toBe("number");
    expect(b.skor).toBeGreaterThanOrEqual(0);
    expect(b.skor).toBeLessThanOrEqual(100);
    expect(["dusuk", "orta", "yuksek"]).toContain(b.olasılik);
    expect(Array.isArray(b.bilesenler)).toBe(true);
    expect(b.bilesenler.length).toBe(5);
  });
});
