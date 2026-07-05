/**
 * Hata telemetrisi endpoint testleri — offline (app.request + sahte D1).
 */
import { describe, it, expect } from "vitest";
import { telemetriRoutes } from "../src/routes/telemetri.js";

function fakeDB() {
  const rows: unknown[][] = [];
  const db = {
    prepare(_sql: string) {
      return {
        _args: [] as unknown[],
        bind(...a: unknown[]) { this._args = a; return this; },
        async run() { rows.push(this._args); return { success: true }; },
        async all() { return { results: [] }; },
      };
    },
    _rows: rows,
  };
  return db as unknown as D1Database & { _rows: unknown[][] };
}
const env = (DB: unknown) => ({ DB, SCRAPER_API_SECRET: "s3cret" } as never);
const post = (payload: unknown, DB = fakeDB()) =>
  telemetriRoutes.request("/hata", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  }, env(DB));

describe("telemetri", () => {
  it("geçerli batch'i yazar ve sayar", async () => {
    const DB = fakeDB();
    const res = await post({ hatalar: [
      { kaynak: "sidepanel", mesaj: "boom", stack: "at x", surum: "0.3.2" },
      { kaynak: "service-worker", mesaj: "reject" },
    ] }, DB);
    expect(res.status).toBe(200);
    expect((await res.json() as { yazilan: number }).yazilan).toBe(2);
    expect(DB._rows.length).toBe(2);
  });

  it("mesajsız satırları atlar", async () => {
    const res = await post({ hatalar: [{ kaynak: "x" }, { kaynak: "y", mesaj: "" }] });
    expect((await res.json() as { yazilan: number }).yazilan).toBe(0);
  });

  it("boş/eksik body 400", async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ hatalar: [] })).status).toBe(400);
  });

  it("çok büyük batch 413", async () => {
    const cok = Array.from({ length: 60 }, (_, i) => ({ kaynak: "x", mesaj: "m" + i }));
    expect((await post({ hatalar: cok })).status).toBe(413);
  });

  it("ozet secret olmadan 401", async () => {
    const res = await telemetriRoutes.request("/ozet?gun=7", {}, env(fakeDB()));
    expect(res.status).toBe(401);
  });
});
