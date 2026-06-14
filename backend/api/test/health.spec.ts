/**
 * Integration testleri — canlı deployed Cadastrum API'ye karşı koşar.
 *
 * `npm test` ile çalıştırılır. Test öncesi `wrangler deploy` yapılmış olmalı.
 * Tek-kullanımlık test hesaplar açar, smoke yapar.
 */
import { describe, it, expect } from "vitest";

const API = process.env.CADASTRUM_API ?? "https://cadastrum-api.dumencibaba1910.workers.dev/v1";

describe("health endpoint", () => {
  it("GET /v1/health → 200 + status:ok", async () => {
    const res = await fetch(`${API}/health`);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.status).toBe("ok");
  });

  it("GET /v1/yok → 404", async () => {
    const res = await fetch(`${API}/yok`);
    expect(res.status).toBe(404);
  });
});

describe("CORS", () => {
  it("Chrome extension origin'ine CORS header döner", async () => {
    const res = await fetch(`${API}/health`, {
      headers: { Origin: "chrome-extension://abc123" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("chrome-extension://abc123");
  });

  it("cadastrum.com.tr origin kabul edilir", async () => {
    const res = await fetch(`${API}/health`, {
      headers: { Origin: "https://cadastrum.com.tr" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("https://cadastrum.com.tr");
  });
});
