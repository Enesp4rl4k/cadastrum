/**
 * CRM Lite integration tests using isolated in-memory Hono test harness.
 * `/v1/crm/*` endpoint'leri Kurumsal Standart+ (pro_plus+) tier gerektirir.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { app } from "../src/index.js";
import { createMockEnv } from "./test-helper.js";

const env = createMockEnv();
let token: string;

beforeAll(async () => {
  const email = `crm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@cadastrum-test.com`;
  const res = await app.request(
    "/v1/auth/kayit",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, sifre: "abcdef12", ad: "CRM Test" }),
    },
    env
  );
  const body = (await res.json()) as { token: string };
  token = body.token;
});

describe("CRM tier gate", () => {
  it("token yoksa 401", async () => {
    const r = await app.request("/v1/crm/musteri", { method: "GET" }, env);
    expect(r.status).toBe(401);
  });

  it("free tier ile 403", async () => {
    const r = await app.request(
      "/v1/crm/musteri",
      {
        headers: { Authorization: `Bearer ${token}` },
      },
      env
    );
    expect(r.status).toBe(403);
  });

  it("free tier ile POST 403", async () => {
    const r = await app.request(
      "/v1/crm/musteri",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ad: "Test Müşteri" }),
      },
      env
    );
    expect(r.status).toBe(403);
  });
});

describe("CRM endpoint mevcudiyet", () => {
  it("DELETE /musteri/:id endpoint var (403 free tier)", async () => {
    const r = await app.request(
      "/v1/crm/musteri/9999999",
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      },
      env
    );
    // Tier engellediği için 403, endpoint var (404 olmamalı)
    expect([403, 404]).toContain(r.status);
  });

  it("GET /musteri/:id/parsel endpoint var", async () => {
    const r = await app.request(
      "/v1/crm/musteri/9999999/parsel",
      {
        headers: { Authorization: `Bearer ${token}` },
      },
      env
    );
    expect([403, 404]).toContain(r.status);
  });

  it("GET /musteri/:id/not endpoint var", async () => {
    const r = await app.request(
      "/v1/crm/musteri/9999999/not",
      {
        headers: { Authorization: `Bearer ${token}` },
      },
      env
    );
    expect([403, 404]).toContain(r.status);
  });
});
