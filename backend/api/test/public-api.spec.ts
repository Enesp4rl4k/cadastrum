/**
 * Public API token + rate limit integration tests using isolated in-memory Hono test harness.
 * `/v1/api/*` endpoint'leri X-API-Key header gerektirir; Kurumsal Pro tier.
 */
import { describe, it, expect } from "vitest";
import { app } from "../src/index.js";
import { createMockEnv } from "./test-helper.js";

const env = createMockEnv();

describe("public API auth", () => {
  it("X-API-Key olmadan 401", async () => {
    const r = await app.request("/v1/api/health", { method: "GET" }, env);
    expect(r.status).toBe(401);
  });

  it("geçersiz X-API-Key 401", async () => {
    const r = await app.request(
      "/v1/api/health",
      {
        method: "GET",
        headers: { "X-API-Key": "cdrm_invalidtokenxxxxx" },
      },
      env
    );
    expect(r.status).toBe(401);
  });

  it("hatalı prefix (cdrm_ olmayan) 401", async () => {
    const r = await app.request(
      "/v1/api/health",
      {
        method: "GET",
        headers: { "X-API-Key": "bearer_xxxxxxxxxx" },
      },
      env
    );
    expect(r.status).toBe(401);
  });
});

describe("public API endpoint mevcudiyet", () => {
  it("GET /fiyat/mahalle/:il/:ilce/:mahalle endpoint var (401 ile)", async () => {
    const r = await app.request("/v1/api/fiyat/mahalle/istanbul/beykoz/akbaba", { method: "GET" }, env);
    // Auth yoksa 401, var ama veri yoksa 404 — her durumda 5xx olmamalı
    expect([401, 404]).toContain(r.status);
  });

  it("GET /emsal/spatial endpoint var", async () => {
    const r = await app.request("/v1/api/emsal/spatial?lat=41.08&lng=29.05&radius_km=3", { method: "GET" }, env);
    expect([401, 400]).toContain(r.status);
  });
});

describe("token oluşturma — JWT bearer + Kurumsal tier", () => {
  it("JWT olmadan POST /tokens 401", async () => {
    const r = await app.request(
      "/v1/api/tokens",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ad: "test-token" }),
      },
      env
    );
    expect(r.status).toBe(401);
  });

  it("free tier kullanıcı POST /tokens 403", async () => {
    // Yeni free kullanıcı kaydet
    const email = `apitok-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@cadastrum-test.com`;
    const kayit = await app.request(
      "/v1/auth/kayit",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, sifre: "abcdef12" }),
      },
      env
    );
    const { token } = (await kayit.json()) as { token: string };

    const r = await app.request(
      "/v1/api/tokens",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ad: "test-token" }),
      },
      env
    );
    expect(r.status).toBe(403); // tierGerekli("kurumsal") engelliyor
  });
});
