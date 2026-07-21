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

  it("TUCBS proxy parametre kontrolü — eksik 400", async () => {
    const r = await fetch(`${API}/proxy/tucbs`);
    expect(r.status).toBe(400);
  });

  it("TUCBS proxy — geçersiz wms slug 400", async () => {
    const r = await fetch(`${API}/proxy/tucbs?wms=evil&lat=38.4&lng=27.1`);
    expect(r.status).toBe(400);
  });

  it("TUCBS tile proxy — geçersiz bbox 400", async () => {
    const r = await fetch(`${API}/proxy/tucbs/tile?wms=csb_cdp_im_wms&bbox=bad`);
    expect(r.status).toBe(400);
  });

  it("Wayback proxy — eksik bbox 400", async () => {
    const r = await fetch(`${API}/proxy/wayback?releaseId=92`);
    expect([400, 404]).toContain(r.status); // 404: deploy öncesi eski worker
  });

  it("Wayback proxy — geçersiz releaseId 400", async () => {
    const q =
      "minLng=32.8&minLat=39.9&maxLng=32.81&maxLat=39.91&releaseId=999";
    const r = await fetch(`${API}/proxy/wayback?${q}`);
    expect([400, 404]).toContain(r.status);
  });
});
