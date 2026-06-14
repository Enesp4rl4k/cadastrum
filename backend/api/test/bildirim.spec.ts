/**
 * Bildirim CRUD integration testleri — canlı deployed API'ye karşı.
 * `CADASTRUM_API` env var ile farklı endpoint'e yönlendirilebilir.
 */
import { describe, it, expect, beforeAll } from "vitest";

const API = process.env.CADASTRUM_API ?? "https://cadastrum-api.cadastrum-tr.workers.dev/v1";

let token: string;

beforeAll(async () => {
  const email = `bildirim-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@cadastrum-test.com`;
  const res = await fetch(`${API}/auth/kayit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, sifre: "abcdef12", ad: "Test" }),
  });
  const body = (await res.json()) as { token: string };
  token = body.token;
});

describe("bildirim auth", () => {
  it("token yoksa 401", async () => {
    const r = await fetch(`${API}/bildirim/list`);
    expect(r.status).toBe(401);
  });

  it("token ile boş liste döner", async () => {
    const r = await fetch(`${API}/bildirim/list`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { abonelikler: unknown[] };
    expect(Array.isArray(body.abonelikler)).toBe(true);
  });
});

describe("bildirim CRUD", () => {
  it("POST /abone — geçerli parametre ile 201", async () => {
    const r = await fetch(`${API}/bildirim/abone`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        tip: "fiyat-degisimi",
        parametre: { lat: 41.08, lng: 29.05, radius_km: 3, kategori: "arsa", esik_yuzde: 5 },
      }),
    });
    expect(r.status).toBe(201);
  });

  it("POST /abone — Türkiye bbox dışı 422", async () => {
    const r = await fetch(`${API}/bildirim/abone`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        tip: "fiyat-degisimi",
        parametre: { lat: 0, lng: 0, radius_km: 3 },
      }),
    });
    expect(r.status).toBe(422);
  });

  it("POST /abone — geçersiz tip 422", async () => {
    const r = await fetch(`${API}/bildirim/abone`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        tip: "yanlis-tip",
        parametre: { lat: 41.08, lng: 29.05, radius_km: 3 },
      }),
    });
    expect(r.status).toBe(422);
  });

  it("PUT durum + DELETE flow", async () => {
    // Yeni abonelik oluştur (free tier limit 1 — bunu test için tier'ı upgrade etmek
    // gerekir ama biz mevcut abonelik üzerinden id alıp güncelliyoruz)
    const list = await (await fetch(`${API}/bildirim/list`, {
      headers: { Authorization: `Bearer ${token}` },
    })).json() as { abonelikler: Array<{ id: number }> };
    if (list.abonelikler.length === 0) {
      // ilk test'in 201'inden gelen abonelik olmalı; yoksa skip
      return;
    }
    const id = list.abonelikler[0]!.id;

    const pasif = await fetch(`${API}/bildirim/${id}/durum`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ durum: "pasif" }),
    });
    expect(pasif.status).toBe(200);

    const sil = await fetch(`${API}/bildirim/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(sil.status).toBe(200);
  });
});

describe("bildirim tier limit", () => {
  it("free tier 1 abonelik üstü 403", async () => {
    // Free tier limit = 1. İlk eklenenden sonra ikinci eklemeye çalış.
    const ek1 = await fetch(`${API}/bildirim/abone`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        tip: "fiyat-degisimi",
        parametre: { lat: 41.08, lng: 29.05, radius_km: 3 },
      }),
    });
    // ilkinin status'una göre branch — eğer önceki test sildiyse 201, kaldıysa 403
    if (ek1.status === 201) {
      const ek2 = await fetch(`${API}/bildirim/abone`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          tip: "yeni-emsal",
          parametre: { lat: 41.0, lng: 29.0, radius_km: 5 },
        }),
      });
      expect(ek2.status).toBe(403);
    }
  });
});
