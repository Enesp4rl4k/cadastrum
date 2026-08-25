/**
 * Health & CORS integration tests using isolated in-memory Hono test harness.
 */
import { describe, it, expect } from "vitest";
import { app } from "../src/index.js";
import { createMockEnv } from "./test-helper.js";

describe("health endpoint", () => {
  const env = createMockEnv();

  it("GET /v1/health → 200 + status:ok", async () => {
    const res = await app.request("/v1/health", { method: "GET" }, env);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.status).toBe("ok");
  });

  it("GET /v1/yok → 404", async () => {
    const res = await app.request("/v1/yok", { method: "GET" }, env);
    expect(res.status).toBe(404);
  });
});

describe("CORS", () => {
  const env = createMockEnv();

  it("Chrome extension origin'ine CORS header döner", async () => {
    const res = await app.request(
      "/v1/health",
      {
        method: "GET",
        headers: { Origin: "chrome-extension://abc123" },
      },
      env
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("chrome-extension://abc123");
  });

  it("cadastrum.com.tr origin kabul edilir", async () => {
    const res = await app.request(
      "/v1/health",
      {
        method: "GET",
        headers: { Origin: "https://cadastrum.com.tr" },
      },
      env
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("https://cadastrum.com.tr");
  });
});
