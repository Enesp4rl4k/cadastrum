/**
 * Kurumsal API v2 integration tests using isolated in-memory Hono test harness.
 */
import { describe, it, expect } from "vitest";
import { app } from "../src/index.js";
import { createMockEnv } from "./test-helper.js";

const env = createMockEnv();

async function sha256(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

describe("API v2 — route varlığı ve auth", () => {
  it("GET /v2/health — 401 (auth gerekli)", async () => {
    const res = await app.request("/v2/health", { method: "GET" }, env);
    expect(res.status).toBe(401);
  });

  it("POST /v2/degerle — 401 (API-Key olmadan)", async () => {
    const res = await app.request(
      "/v2/degerle",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: 41.01, lng: 28.95 }),
      },
      env
    );
    expect(res.status).toBe(401);
  });

  it("POST /v2/batch — 401 (API-Key olmadan)", async () => {
    const res = await app.request(
      "/v2/batch",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ koordinatlar: [{ lat: 41.01, lng: 28.95 }] }),
      },
      env
    );
    expect(res.status).toBe(401);
  });

  it("POST /v2/degerle — Geçersiz key 401", async () => {
    const res = await app.request(
      "/v2/degerle",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": "cdrm_invalid" },
        body: JSON.stringify({ lat: 51.5, lng: -0.1 }),
      },
      env
    );
    expect(res.status).toBe(401);
  });

  it("Geçerli token ile POST /v2/batch ve GET /v2/batch/:id çalışır", async () => {
    const rawKey = "cdrm_v2_valid_key_1234567890";
    const keyHash = await sha256(rawKey);

    // Kullanıcı ve token ekle
    const uRes = await env.DB.prepare(
      "INSERT INTO kullanicilar (email, pw_hash, pw_salt, tier, olusturuldu) VALUES ('v2@test.com', 'hash', 'salt', 'kurumsal', unixepoch())"
    ).run();
    const userId = Number(uRes.meta.last_row_id);

    await env.DB.prepare(
      "INSERT INTO api_tokens (kullanici_id, ad, token_prefix, token_hash, rate_limit_per_min, olusturuldu) VALUES (?, 'Test Token', 'cdrm_v2', ?, 60, unixepoch())"
    ).bind(userId, keyHash).run();

    // POST /v2/batch
    const bRes = await app.request(
      "/v2/batch",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": rawKey,
        },
        body: JSON.stringify({
          koordinatlar: [
            { lat: 41.01, lng: 28.95, alan_m2: 1000 },
            { lat: 39.92, lng: 32.85, alan_m2: 2500 },
          ],
        }),
      },
      env
    );

    expect(bRes.status).toBe(202);
    const bBody: any = await bRes.json();
    expect(bBody.durum).toBe("bekliyor");
    expect(bBody.istek_sayisi).toBe(2);
    expect(bBody.job_id).toBeDefined();

    // GET /v2/batch/:id
    const gRes = await app.request(
      `/v2/batch/${bBody.job_id}`,
      {
        method: "GET",
        headers: { "X-API-Key": rawKey },
      },
      env
    );

    expect(gRes.status).toBe(200);
    const gBody: any = await gRes.json();
    expect(gBody.job_id).toBe(bBody.job_id);
    expect(gBody.istek_sayisi).toBe(2);
  });
});
