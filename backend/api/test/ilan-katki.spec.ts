/**
 * Crowdsource ilan katkı endpoint testleri — offline (app.request + sahte D1).
 * /katki: normal kullanıcı liste-sayfası ilanlarını auth'suz havuza ekler.
 */
import { describe, it, expect } from "vitest";
import { ilanRoutes } from "../src/routes/ilan.js";

function fakeDB() {
  const seen = new Set<string>();
  const rows: unknown[][] = [];
  return {
    prepare() {
      return { bind: (...args: unknown[]) => { rows.push(args); return { _args: args }; } };
    },
    async batch(stmts: Array<{ _args: unknown[] }>) {
      return stmts.map((s) => {
        const no = String(s._args[1]);
        const dup = seen.has(no);
        if (!dup) seen.add(no);
        return { meta: { changes: dup ? 0 : 1 } };
      });
    },
    _rows: rows,
  } as unknown as D1Database & { _rows: unknown[][] };
}
const env = (DB: unknown) => ({ DB } as never);
const gecerli = (no: string, over = {}) => ({
  kaynak: "extension", ilan_no: no, il: "Muğla", ilce: "Bodrum", mahalle: "Yalıkavak",
  fiyat_per_m2: 12500, m2: 1000, kategori: "arsa", ...over,
});
const post = (payload: unknown, DB = fakeDB()) =>
  ilanRoutes.request("/katki", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  }, env(DB));

describe("POST /v1/ilan/katki (crowdsource)", () => {
  it("auth'suz geçerli ilanları ekler", async () => {
    const DB = fakeDB();
    const res = await post({ ilanlar: [gecerli("a1"), gecerli("a2")] }, DB);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ basarili: 2, hata: 0, duplicate: 0 });
  });

  it("kaynak spoofing'i engeller — her zaman 'extension' yazar", async () => {
    const DB = fakeDB();
    await post({ ilanlar: [gecerli("x", { kaynak: "sahibinden" })] }, DB);
    expect(DB._rows[0][0]).toBe("extension"); // ilk bind argümanı = kaynak
  });

  it("aynı ilan_no'yu duplicate sayar", async () => {
    const DB = fakeDB();
    const r = await post({ ilanlar: [gecerli("dup"), gecerli("dup")] }, DB);
    expect(await r.json()).toEqual({ basarili: 1, hata: 0, duplicate: 1 });
  });

  it("geçersiz satırları (kötü fiyat / eksik il) eler", async () => {
    const r = await post({ ilanlar: [
      gecerli("ok"),
      gecerli("bad1", { fiyat_per_m2: -5 }),
      gecerli("bad2", { il: undefined }),
      gecerli("bad3", { kategori: "uzay" }),
    ] });
    expect(await r.json()).toEqual({ basarili: 1, hata: 3, duplicate: 0 });
  });

  it("boş liste 400, >100 ilan 400", async () => {
    expect((await post({ ilanlar: [] })).status).toBe(400);
    const cok = Array.from({ length: 101 }, (_, i) => gecerli("n" + i));
    expect((await post({ ilanlar: cok })).status).toBe(400);
  });
});
