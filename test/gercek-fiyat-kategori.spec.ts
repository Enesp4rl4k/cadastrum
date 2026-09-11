/**
 * Gerçek fiyat kaydı — kategori, katman/iskonto bağlamı ve tekrar kimliği.
 *
 * NEDEN: ilk sürüm kaydı kategorisiz, katmansız ve iskontosuz tutuyordu. Gerçek
 * işlem fiyatı motorun tahminiyle ancak (a) aynı segmentte, (b) tahminin hangi
 * katmandan geldiği ve (c) ona ne kadar asking→kapanış iskontosu uygulandığı
 * biliniyorsa anlamlı kıyaslanabilir. Bu üçü olmadan toplanan her satış,
 * ölçülemeyen bir veri noktasıydı.
 *
 * MUTASYON: `gercekFiyatKaydet`'teki `tarımsalMi(...)` satırını sabit "arsa"
 * yap → "tarla niteliği tarla kategorisi alır" testi kırılır.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Dexie'yi bellekte taklit et — test ortamında IndexedDB yok.
const kayitlar = new Map<number, Record<string, unknown>>();
let sonId = 0;
vi.mock("../src/lib/db", () => ({
  db: {
    gercekFiyatlar: {
      add: async (k: Record<string, unknown>) => {
        const id = ++sonId;
        kayitlar.set(id, { ...k, id });
        return id;
      },
      get: async (id: number) => kayitlar.get(id),
      update: async (id: number, d: Record<string, unknown>) => {
        const k = kayitlar.get(id);
        if (k) kayitlar.set(id, { ...k, ...d });
        return 1;
      },
    },
  },
}));

const { gercekFiyatKaydet, gercekFiyatBackendGonder } = await import("../src/lib/gercek-fiyat");

/** Parsel tipinin testte kullanılan kısmı. */
function parsel(nitelik: string) {
  return {
    ilAd: "İstanbul",
    ilceAd: "Çatalca",
    mahalleAd: "Merkez",
    mahalleKodu: 1,
    adaNo: 101,
    parselNo: 5,
    nitelik,
    alan: 1000,
  } as unknown as Parameters<typeof gercekFiyatKaydet>[0];
}

const giris = {
  gercekFiyatTL: 1_000_000,
  alanM2: 1000,
  tip: "satin-alindi" as const,
  tahminGorulduMu: true,
  heuristicTahminPerM2: 900,
  baselineKaynak: "ilanGozlem-mahalle",
  uygulananIndirim: 0.12,
};

describe("gerçek fiyat kaydı — ölçülebilir bağlam", () => {
  beforeEach(() => {
    kayitlar.clear();
    sonId = 0;
  });

  it("tarla niteliği TARLA kategorisi alır — motorla aynı fonksiyon", async () => {
    const k = await gercekFiyatKaydet(parsel("Tarla"), giris);
    expect(k.kategori).toBe("tarla");
  });

  it("arsa niteliği ARSA kategorisi alır", async () => {
    const k = await gercekFiyatKaydet(parsel("Arsa"), giris);
    expect(k.kategori).toBe("arsa");
  });

  it("tahminin katmanı ve iskontosu kayda girer", async () => {
    const k = await gercekFiyatKaydet(parsel("Tarla"), giris);
    expect(k.baselineKaynak).toBe("ilanGozlem-mahalle");
    expect(k.uygulananIndirim).toBe(0.12);
  });

  it("her kayıt kendi tekrar kimliğini alır", async () => {
    const a = await gercekFiyatKaydet(parsel("Tarla"), giris);
    const b = await gercekFiyatKaydet(parsel("Tarla"), giris);
    expect(a.istemciKimligi).toMatch(/^[0-9a-f-]{36}$/);
    expect(a.istemciKimligi).not.toBe(b.istemciKimligi);
  });

  it("kategorisiz ESKİ kayıt gönderilmez ve sebebi AÇIKÇA söylenir", async () => {
    // 2026-09-11 öncesi kayıtlarda kategori yok ve geriye dönük türetilemez.
    // Göndermeyi denemek her senkronda aynı 422'yi üretirdi.
    kayitlar.set(99, {
      id: 99, parselKey: "x", ilAd: "İstanbul", ilceAd: "Çatalca", mahalleAd: "Merkez",
      gercekFiyatTL: 1, alanM2: 1, gercekPerM2: 1, tahminGorulduMu: false,
      heuristicTahminPerM2: null, tip: "bilgi", girisTarihi: 0, backendSenkronlandi: false,
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const r = await gercekFiyatBackendGonder(99);
    expect(r.basarili).toBe(false);
    expect(r.mesaj).toContain("kategori");
    // Ağa hiç çıkılmadı — reddedileceği bilinen istek atılmıyor.
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("gönderim payload'u kategori, katman, iskonto ve kimliği taşır", async () => {
    const k = await gercekFiyatKaydet(parsel("Tarla"), giris);
    let govde: Record<string, unknown> = {};
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => {
      govde = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ ok: true }), { status: 201 });
    }));

    const r = await gercekFiyatBackendGonder(k.id!);
    expect(r.basarili).toBe(true);
    expect(govde.kategori).toBe("tarla");
    expect(govde.baselineKaynak).toBe("ilanGozlem-mahalle");
    expect(govde.uygulananIndirim).toBe(0.12);
    expect(govde.istemciKimligi).toBe(k.istemciKimligi);
    // Gizlilik sözleşmesi korunuyor: parsel kimliği ve kesin alan GİTMİYOR.
    expect(govde).not.toHaveProperty("parselKey");
    expect(govde).not.toHaveProperty("alanM2");
    vi.unstubAllGlobals();
  });
});
