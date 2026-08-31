import { describe, it, expect } from "vitest";
import { guvenSkoruTavani } from "../src/lib/fiyat/guven-motoru";

/**
 * Bu dosya eskiden sabitleri tek tek yeniden yazıyordu (`toBe(90)`), yani
 * hiçbir şey doğrulamıyordu: değeri değiştirmek testi de değiştirmek demekti.
 *
 * Artık ölçülen doğrulukla tutarlılığı kilitliyor. Referans: 2026-08-31
 * backtest koşumu (test/backtest/real-engine.spec.ts, n=2.400) — kaynak
 * bazlı ±%20 isabet ve bias tablosu guven-motoru.ts'in başında.
 */
describe("Fiyat: guven-motoru modülü", () => {
  it("gözleme dayanan kaynaklar, statik tablodan daha yüksek tavan alır", () => {
    expect(guvenSkoruTavani("ilanGozlem-mahalle")).toBeGreaterThan(
      guvenSkoruTavani("mahalle-baseline", "arsa"),
    );
    expect(guvenSkoruTavani("ilanGozlem-ilce")).toBeGreaterThan(
      guvenSkoruTavani("mahalle-baseline", "arsa"),
    );
  });

  /**
   * Asıl regresyon koruması: statik tablo ARSA'da +%222 bias ölçtü.
   * Tavanı `ilanGozlem-ilce`nin (88) üstüne çıkarmak, ölçümle çelişen eski
   * hâle (90) geri dönmek olur.
   */
  it("statik mahalle tablosu arsada düşük tavanla sınırlanır", () => {
    const tavan = guvenSkoruTavani("mahalle-baseline", "arsa");
    expect(tavan).toBeLessThanOrEqual(50);
  });

  it("aynı kaynak tarlada arsadan daha güvenilir sayılır (ölçüm böyle diyor)", () => {
    expect(guvenSkoruTavani("mahalle-baseline", "tarla")).toBeGreaterThan(
      guvenSkoruTavani("mahalle-baseline", "arsa"),
    );
  });

  it("kategori verilmezse arsa (temkinli olan) varsayılır", () => {
    expect(guvenSkoruTavani("mahalle-baseline")).toBe(
      guvenSkoruTavani("mahalle-baseline", "arsa"),
    );
  });

  it("çözünürlük merdiveni monoton: mahalle > ilçe > il > fallback", () => {
    expect(guvenSkoruTavani("ilanGozlem-mahalle")).toBeGreaterThan(
      guvenSkoruTavani("ilanGozlem-ilce"),
    );
    expect(guvenSkoruTavani("ilce-baseline")).toBeGreaterThan(
      guvenSkoruTavani("il-baseline"),
    );
    expect(guvenSkoruTavani("il-baseline")).toBeGreaterThan(
      guvenSkoruTavani("fallback"),
    );
  });

  it("hiçbir kaynak %100 güven vaat etmez", () => {
    const hepsi = [
      "spatial-radius", "ilanGozlem-mahalle", "ilanGozlem-ilce",
      "mahalle-baseline", "ilce-semt-baseline", "ilce-baseline",
      "il-baseline", "fallback",
    ] as const;
    for (const k of hepsi) {
      expect(guvenSkoruTavani(k, "arsa")).toBeLessThan(100);
      expect(guvenSkoruTavani(k, "tarla")).toBeLessThan(100);
    }
  });
});
