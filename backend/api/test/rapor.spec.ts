/**
 * Paylaşılabilir rapor endpoint testleri — offline (Hono app.request + sahte D1).
 * Canlı API'ye vurmaz; route mantığını izole doğrular.
 */
import { describe, it, expect } from "vitest";
import { raporRoutes } from "../src/routes/rapor.js";

// Minimal in-memory D1 taklidi — sadece raporlar tablosu sorgularını destekler.
function fakeDB() {
  const store = new Map<string, { html: string; baslik: string; bitis: number | null; goruntulenme: number }>();
  const db = {
    prepare(sql: string) {
      const stmt = {
        _args: [] as unknown[],
        bind(...a: unknown[]) { this._args = a; return this; },
        async run() {
          if (/INSERT INTO raporlar/i.test(sql)) {
            const [id, html, baslik, , bitis] = this._args as [string, string, string, number, number];
            store.set(id, { html, baslik, bitis, goruntulenme: 0 });
          } else if (/UPDATE raporlar SET goruntulenme/i.test(sql)) {
            const id = this._args[0] as string;
            const r = store.get(id);
            if (r) r.goruntulenme += 1;
          }
          return { success: true };
        },
        async first<T>() {
          if (/SELECT html, bitis FROM raporlar/i.test(sql)) {
            const id = this._args[0] as string;
            const r = store.get(id);
            return (r ? { html: r.html, bitis: r.bitis } : null) as T | null;
          }
          return null;
        },
      };
      return stmt;
    },
    _store: store,
  };
  return db as unknown as D1Database & { _store: typeof store };
}

const DOC = "<!DOCTYPE html><html><body><h1>Rapor</h1></body></html>";
const env = (DB: unknown) => ({ DB } as never);

describe("rapor shareable-link", () => {
  it("geçerli HTML kaydeder ve id + url döner", async () => {
    const DB = fakeDB();
    const res = await raporRoutes.request(
      "/",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ html: DOC, baslik: "Bodrum 152/7" }) },
      env(DB),
    );
    expect(res.status).toBe(200);
    const j = await res.json() as { id: string; url: string };
    expect(j.id).toMatch(/^[a-z0-9]{12}$/);
    expect(j.url).toContain(`/v1/rapor/${j.id}`);
  });

  it("kaydedilen raporu HTML olarak servis eder", async () => {
    const DB = fakeDB();
    const post = await raporRoutes.request(
      "/",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ html: DOC }) },
      env(DB),
    );
    const { id } = await post.json() as { id: string };
    const get = await raporRoutes.request(`/${id}`, {}, env(DB));
    expect(get.status).toBe(200);
    expect(get.headers.get("content-type")).toContain("text/html");
    expect(await get.text()).toContain("<h1>Rapor</h1>");
    expect(DB._store.get(id)!.goruntulenme).toBe(1); // sayaç arttı
  });

  it("DOCTYPE'sız içeriği reddeder (400)", async () => {
    const res = await raporRoutes.request(
      "/",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ html: "<div>merhaba</div>" }) },
      env(fakeDB()),
    );
    expect(res.status).toBe(400);
  });

  it("çok büyük HTML'i reddeder (413)", async () => {
    const buyuk = "<!DOCTYPE html>" + "x".repeat(800 * 1024);
    const res = await raporRoutes.request(
      "/",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ html: buyuk }) },
      env(fakeDB()),
    );
    expect(res.status).toBe(413);
  });

  it("bilinmeyen id 404 döner", async () => {
    const res = await raporRoutes.request("/yokboyle123", {}, env(fakeDB()));
    expect(res.status).toBe(404);
  });

  it("geçersiz id formatı 400 döner", async () => {
    const res = await raporRoutes.request("/ab", {}, env(fakeDB()));
    expect(res.status).toBe(400);
  });
});
