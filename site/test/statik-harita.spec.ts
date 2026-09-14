/**
 * Harita statik paketi — karar kuralı: dosya yoksa/bozuksa null, çağıran
 * canlı API'ye düşer; sürüm uyuşmazlığı da null sayılır.
 *
 * NEDEN: Workers ücretsiz planı günde 100.000 istekle sınırlı — D1
 * bütçesinden ayrı bir platform tavanı. /harita/ozet + /harita/ilceler her
 * ziyarette tetikleniyordu; build'de bir kez indirilip statik sunuluyor.
 *
 * MUTASYON: statik-harita.ts'de `p.surum === BEKLENEN_SURUM ? p : null`
 * ifadesini `p` ile değiştir (sürüm kontrolü kalksın) → 3. test kırılır.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { haritaPaketiGetir, _testIcinSifirla } from "../src/lib/statik-harita";

const PAKET = {
  surum: 1,
  uretildi: 1,
  ozet: { 1: { ozet: [{ ilce_kodu: 250, nokta_sayisi: 3, toplam_islem: 12 }] } },
  ilceler: { ilceler: [{ ilce_kodu: 250, lat: 41.1, lng: 28.4 }] },
  gelisenBolgeler: { iller: [] },
  trend: { arsa: { iller: [] }, tarla: { iller: [] } },
};

afterEach(() => {
  vi.unstubAllGlobals();
  _testIcinSifirla();
});

describe("haritaPaketiGetir", () => {
  it("paket varsa döner ve İKİNCİ çağrıda tekrar fetch atmaz", async () => {
    let sayac = 0;
    _testIcinSifirla(async () => {
      sayac++;
      return new Response(JSON.stringify(PAKET), { status: 200 });
    });
    const p1 = await haritaPaketiGetir();
    expect(p1).toEqual(PAKET);
    const p2 = await haritaPaketiGetir();
    expect(p2).toEqual(PAKET);
    expect(sayac).toBe(1);
  });

  it("dosya yok (404) → null", async () => {
    _testIcinSifirla(async () => new Response("yok", { status: 404 }));
    expect(await haritaPaketiGetir()).toBeNull();
  });

  it("sürüm uyuşmazlığı → null (eski build'in yarım kalmış dosyası kullanılmaz)", async () => {
    _testIcinSifirla(async () => new Response(JSON.stringify({ ...PAKET, surum: 2 }), { status: 200 }));
    expect(await haritaPaketiGetir()).toBeNull();
  });

  it("ağ hatası → null, atmıyor", async () => {
    _testIcinSifirla(async () => { throw new Error("ağ yok"); });
    await expect(haritaPaketiGetir()).resolves.toBeNull();
  });
});
