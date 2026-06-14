/**
 * Fiyat motoru — kalibrasyon, güven ve emsal ağırlık iyileştirmeleri.
 *
 * Bu testler `fiyat-tahmin.ts` ve `baseline-engine.ts`'in birim seviyesinde
 * doğru davrandığını sabitler. fiyatTahminEt() entry point'i DB + storage'a
 * bağlı olduğu için node ortamında çalışmaz — burada saf fonksiyonları test
 * ediyoruz.
 */
import { describe, it, expect } from "vitest";
import {
  KAPPA_BY_KATEGORI,
  baselineBandGenisletme,
  triangulateBaseline,
  type TriangulasyonKaynak,
} from "../src/lib/baseline-engine";
import {
  yasAgirligi,
  guvenSkoruTavani,
} from "../src/lib/fiyat-tahmin";

const GUN_MS = 86_400_000;

describe("yasAgirligi (continuous exponential decay, half-life 60 gün)", () => {
  it("0 gün → 1.0", () => {
    expect(yasAgirligi(Date.now())).toBeCloseTo(1.0, 3);
  });

  it("60 gün → ~0.5 (half-life)", () => {
    const w = yasAgirligi(Date.now() - 60 * GUN_MS);
    expect(w).toBeCloseTo(0.5, 2);
  });

  it("120 gün → ~0.25", () => {
    const w = yasAgirligi(Date.now() - 120 * GUN_MS);
    expect(w).toBeCloseTo(0.25, 2);
  });

  it("180+ gün → 0 (stale cutoff)", () => {
    expect(yasAgirligi(Date.now() - 181 * GUN_MS)).toBe(0);
    expect(yasAgirligi(Date.now() - 365 * GUN_MS)).toBe(0);
  });

  it("monoton azalır (basamak yok)", () => {
    const w0 = yasAgirligi(Date.now() - 29 * GUN_MS);
    const w1 = yasAgirligi(Date.now() - 31 * GUN_MS);
    const w2 = yasAgirligi(Date.now() - 89 * GUN_MS);
    const w3 = yasAgirligi(Date.now() - 91 * GUN_MS);
    expect(w0).toBeGreaterThan(w1);
    expect(w1).toBeGreaterThan(w2);
    expect(w2).toBeGreaterThan(w3);
    // 30 ve 90 gün eşiklerinde eski basamak fonksiyonu 0.4 ve 0.3 sıçraması yapıyordu
    expect(Math.abs(w0 - w1)).toBeLessThan(0.05);
    expect(Math.abs(w2 - w3)).toBeLessThan(0.05);
  });

  it("geçersiz/sıfır/negatif zaman → 0", () => {
    expect(yasAgirligi(0)).toBe(0);
    expect(yasAgirligi(-1)).toBe(0);
  });

  it("gelecek tarih → 1.0 (scrape hatası kabul)", () => {
    expect(yasAgirligi(Date.now() + 10 * GUN_MS)).toBe(1.0);
  });
});

describe("KAPPA_BY_KATEGORI (segment-bazlı Bayesian shrinkage)", () => {
  it("tarla için en yüksek κ — düşük güvenli tarla mahallesi ilçeye daha çok çekilir", () => {
    expect(KAPPA_BY_KATEGORI.tarla).toBeGreaterThan(KAPPA_BY_KATEGORI.arsa);
    expect(KAPPA_BY_KATEGORI.tarla).toBeGreaterThan(KAPPA_BY_KATEGORI.konut);
  });

  it("konut için en düşük κ — likit piyasada mahalle sinyaline daha çok güven", () => {
    expect(KAPPA_BY_KATEGORI.konut).toBeLessThanOrEqual(KAPPA_BY_KATEGORI.arsa);
  });

  it("tüm değerler pozitif", () => {
    expect(KAPPA_BY_KATEGORI.arsa).toBeGreaterThan(0);
    expect(KAPPA_BY_KATEGORI.konut).toBeGreaterThan(0);
    expect(KAPPA_BY_KATEGORI.tarla).toBeGreaterThan(0);
  });
});

describe("guvenSkoruTavani (kaynak-bazlı üst sınır)", () => {
  it("ilanGozlem-mahalle en yüksek (98)", () => {
    expect(guvenSkoruTavani("ilanGozlem-mahalle")).toBe(98);
  });

  it("fallback en düşük (≤50)", () => {
    expect(guvenSkoruTavani("fallback")).toBeLessThanOrEqual(50);
  });

  it("monoton: mahalle > ilçe > il > fallback", () => {
    expect(guvenSkoruTavani("ilanGozlem-mahalle"))
      .toBeGreaterThan(guvenSkoruTavani("ilanGozlem-ilce"));
    expect(guvenSkoruTavani("ilce-baseline"))
      .toBeGreaterThan(guvenSkoruTavani("il-baseline"));
    expect(guvenSkoruTavani("il-baseline"))
      .toBeGreaterThan(guvenSkoruTavani("fallback"));
  });

  it("ilce-baseline tavanı ≤70 (eski clamp 98 yerine)", () => {
    expect(guvenSkoruTavani("ilce-baseline")).toBeLessThanOrEqual(70);
  });
});

describe("baselineBandGenisletme (kaynak + uyumsuzluk → bant ek genişliği)", () => {
  it("ilanGozlem-mahalle: ek genişletme yok", () => {
    expect(baselineBandGenisletme({ kaynak: "ilanGozlem-mahalle" })).toBe(0);
  });

  it("ilce-baseline: pozitif ek genişletme", () => {
    expect(baselineBandGenisletme({ kaynak: "ilce-baseline" })).toBeGreaterThan(0);
  });

  it("fallback: ilce-baseline'dan daha geniş bant", () => {
    const ilce = baselineBandGenisletme({ kaynak: "ilce-baseline" });
    const fb = baselineBandGenisletme({ kaynak: "fallback" });
    expect(fb).toBeGreaterThan(ilce);
  });

  it("uyumsuzluk > 0.2 → ek genişleme", () => {
    const dusukCv = baselineBandGenisletme({ kaynak: "mahalle-baseline", uyumsuzluk: 0.1 });
    const yuksekCv = baselineBandGenisletme({ kaynak: "mahalle-baseline", uyumsuzluk: 0.35 });
    expect(yuksekCv).toBeGreaterThan(dusukCv);
  });

  it("uyumsuzluk ≤ 0.2 → ek genişletme yok", () => {
    const a = baselineBandGenisletme({ kaynak: "mahalle-baseline", uyumsuzluk: 0.0 });
    const b = baselineBandGenisletme({ kaynak: "mahalle-baseline", uyumsuzluk: 0.2 });
    expect(b).toBe(a);
  });

  it("tavan 0.25 — aşırı CV'de bile bant açılışı sınırlı", () => {
    expect(baselineBandGenisletme({ kaynak: "fallback", uyumsuzluk: 1.0 })).toBeLessThanOrEqual(0.25);
  });
});

describe("triangulateBaseline (manuelReviewGerek + uyumsuzluk yayılımı)", () => {
  it("uyumlu kaynaklar → manuelReviewGerek false", () => {
    const k: TriangulasyonKaynak[] = [
      { fiyat: 10_000, guven: 80, ad: "api-mahalle" },
      { fiyat: 10_500, guven: 70, ad: "ai-research" },
    ];
    const r = triangulateBaseline(k);
    expect(r).not.toBeNull();
    expect(r!.manuelReviewGerek).toBe(false);
    expect(r!.uyumsuzluk).toBeLessThan(0.1);
  });

  it("yüksek varyans → manuelReviewGerek true + uyumsuzluk > 0.3", () => {
    const k: TriangulasyonKaynak[] = [
      { fiyat: 5_000, guven: 70, ad: "api-mahalle" },
      { fiyat: 15_000, guven: 70, ad: "ai-research" },
    ];
    const r = triangulateBaseline(k);
    expect(r).not.toBeNull();
    expect(r!.manuelReviewGerek).toBe(true);
    expect(r!.uyumsuzluk).toBeGreaterThan(0.3);
  });

  it("Tukey outlier 3+ kaynakta uygulanır", () => {
    const k: TriangulasyonKaynak[] = [
      { fiyat: 10_000, guven: 80, ad: "api-mahalle" },
      { fiyat: 10_500, guven: 80, ad: "ai-research" },
      { fiyat: 11_000, guven: 80, ad: "knn-smoothing" },
      { fiyat: 100_000, guven: 80, ad: "ilce-baseline" }, // açık outlier
    ];
    const r = triangulateBaseline(k);
    expect(r).not.toBeNull();
    expect(r!.outlierSayisi).toBeGreaterThanOrEqual(1);
    expect(r!.fiyat).toBeLessThan(20_000);
  });

  it("tek kaynak → direkt dön", () => {
    const r = triangulateBaseline([{ fiyat: 8000, guven: 75, ad: "api-mahalle" }]);
    expect(r).not.toBeNull();
    expect(r!.kaynakSayisi).toBe(1);
    expect(r!.fiyat).toBe(8000);
    expect(r!.manuelReviewGerek).toBe(false);
  });
});
