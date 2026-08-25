/**
 * Proxy endpoint testleri (isolated in-memory test suite).
 * S1.4 sonrası AFAD TDTH kaldırıldı; sadece e-Plan ve TUCBS proxy var.
 */
import { describe, it, expect } from "vitest";
import { app } from "../src/index.js";
import { createMockEnv } from "./test-helper.js";

describe("proxy endpoints", () => {
  const env = createMockEnv();

  it("AFAD TDTH proxy artık yok (404 beklenir)", async () => {
    const r = await app.request("/v1/proxy/afad-tdth?lat=41&lng=29", { method: "GET" }, env);
    expect(r.status).toBe(404);
  });

  it("e-Plan proxy parametre kontrolü — eksik 400", async () => {
    const r = await app.request("/v1/proxy/eplan", { method: "GET" }, env);
    expect(r.status).toBe(400);
  });

  it("e-Plan proxy parametre tip kontrolü — non-numeric 400", async () => {
    const r = await app.request(
      "/v1/proxy/eplan?ilceKodu=abc&mahalleKodu=123&adaNo=456&parselNo=789",
      { method: "GET" },
      env
    );
    expect(r.status).toBe(400);
  });

  it("TUCBS proxy parametre kontrolü — eksik 400", async () => {
    const r = await app.request("/v1/proxy/tucbs", { method: "GET" }, env);
    expect(r.status).toBe(400);
  });

  it("TUCBS proxy — geçersiz wms slug 400", async () => {
    const r = await app.request("/v1/proxy/tucbs?wms=evil&lat=38.4&lng=27.1", { method: "GET" }, env);
    expect(r.status).toBe(400);
  });

  it("TUCBS tile proxy — geçersiz z/x/y 400", async () => {
    const r = await app.request("/v1/proxy/tucbs/tile/csb_cdp_im_wms/bad/0/0", { method: "GET" }, env);
    expect(r.status).toBe(400);
  });
});
