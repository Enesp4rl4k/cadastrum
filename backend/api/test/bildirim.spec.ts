/**
 * Bildirim CRUD integration tests using isolated in-memory Hono test harness.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { app } from "../src/index.js";
import { createMockEnv } from "./test-helper.js";

const env = createMockEnv();
let token: string;

beforeAll(async () => {
  const email = `bildirim-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@cadastrum-test.com`;
  const res = await app.request(
    "/v1/auth/kayit",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, sifre: "abcdef12", ad: "Test" }),
    },
    env
  );
  const body = (await res.json()) as { token: string };
  token = body.token;
});

describe("bildirim auth", () => {
  it("token yoksa 401", async () => {
    const r = await app.request("/v1/bildirim/list", { method: "GET" }, env);
    expect(r.status).toBe(401);
  });

  it("token ile boş liste döner", async () => {
    const r = await app.request(
      "/v1/bildirim/list",
      {
        headers: { Authorization: `Bearer ${token}` },
      },
      env
    );
    expect(r.status).toBe(200);
    const body = (await r.json()) as { abonelikler: unknown[] };
    expect(Array.isArray(body.abonelikler)).toBe(true);
  });
});

describe("bildirim CRUD", () => {
  it("POST /abone — geçerli parametre ile 201", async () => {
    const r = await app.request(
      "/v1/bildirim/abone",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          tip: "fiyat-degisimi",
          parametre: { lat: 41.08, lng: 29.05, radius_km: 3, kategori: "arsa", esik_yuzde: 5 },
        }),
      },
      env
    );
    expect(r.status).toBe(201);
  });

  it("POST /abone — Türkiye bbox dışı 422", async () => {
    const r = await app.request(
      "/v1/bildirim/abone",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          tip: "fiyat-degisimi",
          parametre: { lat: 0, lng: 0, radius_km: 3 },
        }),
      },
      env
    );
    expect(r.status).toBe(422);
  });

  it("POST /abone — geçersiz tip 422", async () => {
    const r = await app.request(
      "/v1/bildirim/abone",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          tip: "yanlis-tip",
          parametre: { lat: 41.08, lng: 29.05, radius_km: 3 },
        }),
      },
      env
    );
    expect(r.status).toBe(422);
  });

  it("PUT durum + DELETE flow", async () => {
    const listRes = await app.request(
      "/v1/bildirim/list",
      {
        headers: { Authorization: `Bearer ${token}` },
      },
      env
    );
    const list = (await listRes.json()) as { abonelikler: Array<{ id: number }> };
    if (list.abonelikler.length === 0) {
      return;
    }
    const id = list.abonelikler[0]!.id;

    const pasif = await app.request(
      `/v1/bildirim/${id}/durum`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ durum: "pasif" }),
      },
      env
    );
    expect(pasif.status).toBe(200);

    const sil = await app.request(
      `/v1/bildirim/${id}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      },
      env
    );
    expect(sil.status).toBe(200);
  });
});

describe("bildirim tier limit", () => {
  it("free tier 1 abonelik üstü 403", async () => {
    const ek1 = await app.request(
      "/v1/bildirim/abone",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          tip: "fiyat-degisimi",
          parametre: { lat: 41.08, lng: 29.05, radius_km: 3 },
        }),
      },
      env
    );
    if (ek1.status === 201) {
      const ek2 = await app.request(
        "/v1/bildirim/abone",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            tip: "yeni-emsal",
            parametre: { lat: 41.0, lng: 29.0, radius_km: 5 },
          }),
        },
        env
      );
      expect(ek2.status).toBe(403);
    }
  });
});
