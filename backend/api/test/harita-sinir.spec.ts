/**
 * Harita istek sınırı — statik uç sınırlanmaz, D1 uçları korunur.
 *
 * NEDEN: tüm /v1/harita/* saatte 30 isteği paylaşıyordu; harita sayfası
 * görünen her ilçe için ayrı istek attığından ilk açılışta ~30 istekten
 * sonra her şey 429 alıyor ve sayfa boş kalıyordu (2026-07-16'dan beri).
 * /harita/likidite D1'e hiç dokunmuyor — sınırlanması yalnızca sayfayı
 * bozuyordu.
 *
 * 2026-09-13: sınırlayıcı KV'den Cloudflare Rate Limiting'e taşındı
 * (lib/rate-limit.ts). Harita saatlik 300 niyetiyle SINIR_YOGUN sınıfında:
 * dakikada 120. Test gerçekten SAYAN sahte binding kullanıyor — sayım
 * yapmayan sahte ile "hepsi 200" testi muafiyet olmasa bile geçerdi.
 *
 * MUTASYON: index.ts'deki `if (c.req.path === "/v1/harita/likidite") return next();`
 * satırını kaldır → ilk test kırılır (121. istekte 429).
 */
import { describe, it, expect } from "vitest";
import { app } from "../src/index.js";
import { createMockEnv } from "./test-helper.js";
import { SINIF_DAKIKA_LIMIT } from "../src/lib/rate-limit.js";

const LIMIT = SINIF_DAKIKA_LIMIT.SINIR_YOGUN;

function sayanBinding(limit: number) {
  const sayim = new Map<string, number>();
  return {
    sayim,
    binding: {
      limit: async ({ key }: { key: string }) => {
        const n = (sayim.get(key) ?? 0) + 1;
        sayim.set(key, n);
        return { success: n <= limit };
      },
    } as unknown as RateLimit,
  };
}

describe("harita istek sınırı", () => {
  it("statik /harita/likidite sınırlanmaz — sınıf limitinin üstünde bile", async () => {
    const { binding } = sayanBinding(LIMIT);
    const env = createMockEnv({ SINIR_YOGUN: binding });
    for (let i = 0; i < LIMIT + 10; i++) {
      const r = await app.request("/v1/harita/likidite?kategori=arsa", { method: "GET" }, env);
      expect(r.status, `${i + 1}. istek`).toBe(200);
    }
  });

  it("D1 uçları hâlâ sınırlı — limit+1. istek 429 (koruma kalkmadı)", async () => {
    const { binding } = sayanBinding(LIMIT);
    const env = createMockEnv({ SINIR_YOGUN: binding });
    let ilk429 = -1;
    for (let i = 0; i < LIMIT + 10; i++) {
      const r = await app.request("/v1/harita/ozet?analizTip=1&birlesik=1", { method: "GET" }, env);
      if (r.status === 429) { ilk429 = i + 1; break; }
    }
    expect(ilk429).toBe(LIMIT + 1);
  });

  it("likidite istekleri D1 uçlarının sayacını TÜKETMEZ", async () => {
    const { binding, sayim } = sayanBinding(LIMIT);
    const env = createMockEnv({ SINIR_YOGUN: binding });
    for (let i = 0; i < 50; i++) {
      await app.request("/v1/harita/likidite?kategori=arsa", { method: "GET" }, env);
    }
    await app.request("/v1/harita/ozet?analizTip=1&birlesik=1", { method: "GET" }, env);
    expect([...sayim.values()]).toEqual([1]);
  });
});
