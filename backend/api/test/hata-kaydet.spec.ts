/**
 * sunucuHatasiKaydet testleri.
 *
 * Kritik davranış: bu fonksiyon `app.onError` içinden çağrılıyor, dolayısıyla
 * HİÇBİR koşulda throw etmemeli — aksi hâlde asıl hatayı maskeler ve 500
 * yanıtını bozar. Testlerin ağırlığı bu güvencede.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { sunucuHatasiKaydet, _throttleSifirla } from "../src/lib/hata-kaydet.js";

/** Bind edilen parametreleri yakalayan sahte D1. */
function sahteDb() {
  const bindler: unknown[][] = [];
  const db = {
    prepare: vi.fn(() => ({
      bind: (...args: unknown[]) => {
        bindler.push(args);
        return { run: async () => ({ success: true }) };
      },
    })),
  };
  return { db: db as never, bindler };
}

describe("sunucuHatasiKaydet", () => {
  beforeEach(() => _throttleSifirla());

  it("Error nesnesini mesaj + stack ile yazar", async () => {
    const { db, bindler } = sahteDb();
    const ok = await sunucuHatasiKaydet(db, new Error("patladi"), {
      method: "GET",
      path: "/v1/test",
      requestId: "req-1",
    });
    expect(ok).toBe(true);
    const [mesaj, stack, meta, , requestId] = bindler[0]!;
    expect(mesaj).toBe("patladi");
    expect(String(stack)).toContain("Error");
    expect(JSON.parse(String(meta))).toEqual({ method: "GET", path: "/v1/test" });
    expect(requestId).toBe("req-1");
  });

  it("Error olmayan fırlatmayı da kaydeder", async () => {
    const { db, bindler } = sahteDb();
    expect(await sunucuHatasiKaydet(db, "duz string hata")).toBe(true);
    expect(bindler[0]![0]).toBe("duz string hata");
  });

  it("db yoksa sessizce false döner", async () => {
    expect(await sunucuHatasiKaydet(undefined, new Error("x"))).toBe(false);
  });

  it("D1 patlarsa THROW ETMEZ — false döner", async () => {
    const patlayan = {
      prepare: () => {
        throw new Error("D1 erisilemez");
      },
    } as never;
    await expect(sunucuHatasiKaydet(patlayan, new Error("asil hata"))).resolves.toBe(false);
  });

  it("run() reddederse THROW ETMEZ", async () => {
    const patlayan = {
      prepare: () => ({
        bind: () => ({ run: async () => { throw new Error("yazma basarisiz"); } }),
      }),
    } as never;
    await expect(sunucuHatasiKaydet(patlayan, new Error("asil"))).resolves.toBe(false);
  });

  it("uzun mesaj ve stack kırpılır", async () => {
    const { db, bindler } = sahteDb();
    const hata = new Error("x".repeat(5000));
    hata.stack = "y".repeat(9000);
    await sunucuHatasiKaydet(db, hata);
    expect(String(bindler[0]![0]).length).toBe(500);
    expect(String(bindler[0]![1]).length).toBe(2000);
  });

  it("throttle: pencere başına 20 yazmadan sonrasını atlar", async () => {
    const { db, bindler } = sahteDb();
    for (let i = 0; i < 25; i++) await sunucuHatasiKaydet(db, new Error(`e${i}`));
    expect(bindler.length).toBe(20);
    // 21. çağrı false dönmeli
    expect(await sunucuHatasiKaydet(db, new Error("fazla"))).toBe(false);
  });
});
