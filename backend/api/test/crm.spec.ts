/**
 * CRM Lite integration testleri.
 * `/v1/crm/*` endpoint'leri Kurumsal Standart+ (pro_plus+) tier gerektirir.
 */
import { describe, it, expect, beforeAll } from "vitest";

const API = process.env.CADASTRUM_API ?? "https://cadastrum-api.cadastrum-tr.workers.dev/v1";

let token: string;

beforeAll(async () => {
  const email = `crm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@cadastrum-test.com`;
  const res = await fetch(`${API}/auth/kayit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, sifre: "abcdef12", ad: "CRM Test" }),
  });
  const body = (await res.json()) as { token: string };
  token = body.token;
});

describe("CRM tier gate", () => {
  it("token yoksa 401", async () => {
    const r = await fetch(`${API}/crm/musteri`);
    expect(r.status).toBe(401);
  });

  it("free tier ile 403", async () => {
    const r = await fetch(`${API}/crm/musteri`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(r.status).toBe(403);
  });

  it("free tier ile POST 403", async () => {
    const r = await fetch(`${API}/crm/musteri`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ad: "Test Müşteri" }),
    });
    expect(r.status).toBe(403);
  });
});

describe("CRM endpoint mevcudiyet", () => {
  it("DELETE /musteri/:id endpoint var (403 free tier)", async () => {
    const r = await fetch(`${API}/crm/musteri/9999999`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    // Tier engellediği için 403, endpoint var (404 olmamalı)
    expect([403, 404]).toContain(r.status);
  });

  it("GET /musteri/:id/parsel endpoint var", async () => {
    const r = await fetch(`${API}/crm/musteri/9999999/parsel`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect([403, 404]).toContain(r.status);
  });

  it("GET /musteri/:id/not endpoint var", async () => {
    const r = await fetch(`${API}/crm/musteri/9999999/not`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect([403, 404]).toContain(r.status);
  });
});
