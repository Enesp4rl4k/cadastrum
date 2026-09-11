/**
 * Sunucu hata kaydı — D1 çökerken kanıt kaybolmasın.
 *
 * 2026-09-11: D1 okuma limiti dolunca /v1/fiyat/* canlı 500 döndü ama
 * `hata_log`'da son 7 günde SIFIR backend satırı vardı. Kayıt çöken şeye
 * (D1) yazılıyor, catch bunu yutuyordu. Artık D1 yazamazsa KV'ye düşüyor.
 *
 * MUTASYON: hata-kaydet.ts'de `kv.put(...)` bloğunu kaldır → "KV'ye düşer"
 * testi kırılır.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { sunucuHatasiKaydet, _throttleSifirla } from "../src/lib/hata-kaydet.js";

function reddedenD1(): D1Database {
  return {
    prepare: () => ({
      bind: () => ({ run: async () => { throw new Error("D1_ERROR: row read limit"); } }),
    }),
  } as unknown as D1Database;
}

function calisanD1(): D1Database {
  return {
    prepare: () => ({ bind: () => ({ run: async () => ({ meta: {} }) }) }),
  } as unknown as D1Database;
}

function sahteKV() {
  const yazilan: Array<{ key: string; value: string; ttl?: number }> = [];
  const kv = {
    put: async (key: string, value: string, o?: { expirationTtl?: number }) => {
      yazilan.push({ key, value, ttl: o?.expirationTtl });
    },
  } as unknown as KVNamespace;
  return { kv, yazilan };
}

describe("sunucuHatasiKaydet — D1 çökerken", () => {
  beforeEach(() => _throttleSifirla());

  it("D1 çalışıyorsa D1'e yazar, KV'ye dokunmaz", async () => {
    const { kv, yazilan } = sahteKV();
    const r = await sunucuHatasiKaydet(calisanD1(), new Error("x"), { path: "/v1/a" }, kv);
    expect(r).toBe("d1");
    expect(yazilan).toHaveLength(0);
  });

  it("D1 yazamazsa KV'ye DÜŞER — kesinti kendi kanıtını silmez", async () => {
    const { kv, yazilan } = sahteKV();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await sunucuHatasiKaydet(
      reddedenD1(), new Error("asıl hata"), { path: "/v1/fiyat/il/istanbul", requestId: "r1" }, kv,
    );
    expect(r).toBe("kv");
    expect(yazilan).toHaveLength(1);
    const kayit = JSON.parse(yazilan[0]!.value);
    expect(kayit.mesaj).toBe("asıl hata");
    expect(kayit.d1Hatasi).toContain("row read limit");
    expect(yazilan[0]!.ttl).toBeGreaterThan(0);
    spy.mockRestore();
  });

  it("D1 yazamaması SESSİZ değil — sabit adlı log olayı atılır", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await sunucuHatasiKaydet(reddedenD1(), new Error("x"), {}, undefined);
    const olaylar = spy.mock.calls.map((c) => String(c[0]));
    expect(olaylar.some((o) => o.includes("hata-log.d1-yazilamadi"))).toBe(true);
    spy.mockRestore();
  });

  it("hiçbir koşulda fırlatmaz — onError'u maskelememeli", async () => {
    const bozukKV = { put: async () => { throw new Error("kv down"); } } as unknown as KVNamespace;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(sunucuHatasiKaydet(reddedenD1(), new Error("x"), {}, bozukKV)).resolves.toBe(false);
    spy.mockRestore();
  });
});
