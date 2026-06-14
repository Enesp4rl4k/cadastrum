/**
 * Proxy endpoint testleri.
 * S1.4 sonrası AFAD TDTH kaldırıldı; sadece e-Plan proxy var.
 */
import { describe, it, expect } from "vitest";

const API = process.env.CADASTRUM_API ?? "https://cadastrum-api.cadastrum-tr.workers.dev/v1";

describe("proxy endpoints", () => {
  it("AFAD TDTH proxy artık yok (404 beklenir)", async () => {
    const r = await fetch(`${API}/proxy/afad-tdth?lat=41&lng=29`);
    expect(r.status).toBe(404);
  });

  it("e-Plan proxy parametre kontrolü — eksik 400", async () => {
    const r = await fetch(`${API}/proxy/eplan`);
    expect(r.status).toBe(400);
  });

  it("e-Plan proxy parametre tip kontrolü — non-numeric 400", async () => {
    const r = await fetch(
      `${API}/proxy/eplan?ilceKodu=abc&mahalleKodu=123&adaNo=456&parselNo=789`,
    );
    expect(r.status).toBe(400);
  });

  it("e-Plan proxy parametre tip kontrolü — alphanumeric 400", async () => {
    const r = await fetch(
      `${API}/proxy/eplan?ilceKodu=123&mahalleKodu=abc&adaNo=456&parselNo=789`,
    );
    expect(r.status).toBe(400);
  });
});
