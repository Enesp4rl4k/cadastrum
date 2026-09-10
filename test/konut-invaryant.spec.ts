/**
 * `KonutDegerlemeEngine` — İÇ TUTARLILIK invaryantları.
 *
 * ── BU DOSYA DOĞRULUK ÖLÇMÜYOR (P10) ────────────────────────────────────────
 *
 * Buradaki testler motorun kendi katsayılarıyla tutarlı davrandığını gösterir:
 * yaş arttıkça değer düşer, kat sırası korunur, site primi pozitiftir. Bunlar
 * gerçek bir invaryant ve regresyonu yakalar — ama **piyasaya ne kadar
 * yaklaştığını söylemezler.**
 *
 * Ayrımın kaydı: bu testler `test/backtest/konut-engine.spec.ts` içinde
 * "Gerçek benchmark profillerinde … MAPE <= %15" adıyla duruyordu ve doğruluk
 * kapısının içindeydi. Aynı dosyadaki hold-out testi konut ±%20 = 66,4
 * raporluyordu; ölçtüğü veri `kaynak='knn-smoothing'` etiketli TÜRETİLMİŞ
 * tablonun kendisiydi (`data/konut-backtest-sizinti.json`).
 *
 * O yüzden dosya doğruluk kapısından (`test/backtest/**`, `npm run
 * backtest:real`) çıkarılıp normal test suit'ine alındı ve adı ölçtüğü şeyi
 * söyleyecek biçimde değiştirildi.
 *
 * KONUTUN DOĞRULUĞU BUGÜN ÖLÇÜLMEMİŞ DURUMDA: korpusta gerçek konut ilanı 0.
 */

import { describe, it, expect } from "vitest";
import { KonutDegerlemeEngine, type KonutGirdisi } from "../src/lib/konut/konut-degerleme";

describe("KonutDegerlemeEngine iç tutarlılık invaryantları (doğruluk DEĞİL)", () => {
  const engine = new KonutDegerlemeEngine();
  const bazFiyatM2 = 40_000;
  const bazGirdi: KonutGirdisi = {
    il: "istanbul",
    ilce: "kadikoy",
    mahalle: "caddebostan",
    brutM2: 100,
    binaYasi: 0,
    bulunduguKat: "ara_kat",
    siteIciMi: false,
  };

  it("bina yaşı arttıkça değer monotonik azalır", () => {
    const d = (yas: number) =>
      engine.degerle({ ...bazGirdi, binaYasi: yas }, bazFiyatM2).tahminiPiyasaDegeriTL;

    expect(d(0)).toBeGreaterThan(d(5));
    expect(d(5)).toBeGreaterThan(d(15));
    expect(d(15)).toBeGreaterThan(d(25));
    expect(d(25)).toBeGreaterThan(d(35));
  });

  it("kat pozisyonu sıralaması korunur: kot < zemin < ara_kat < dubleks", () => {
    const d = (kat: KonutGirdisi["bulunduguKat"]) =>
      engine.degerle({ ...bazGirdi, bulunduguKat: kat }, bazFiyatM2).tahminiPiyasaDegeriTL;

    expect(d("kot")).toBeLessThan(d("zemin"));
    expect(d("zemin")).toBeLessThan(d("ara_kat"));
    expect(d("ara_kat")).toBeLessThan(d("dubleks"));
  });

  it("site içi çarpanı pozitif prim üretir", () => {
    const sitesiz = engine.degerle(bazGirdi, bazFiyatM2).tahminiPiyasaDegeriTL;
    const siteli = engine.degerle({ ...bazGirdi, siteIciMi: true }, bazFiyatM2).tahminiPiyasaDegeriTL;

    expect(siteli).toBeGreaterThan(sitesiz);
    expect(siteli).toBeCloseTo(sitesiz * 1.15, -4);
  });

  it("değer brüt m² ile orantılı ölçeklenir", () => {
    const k100 = engine.degerle({ ...bazGirdi, brutM2: 100 }, bazFiyatM2).tahminiPiyasaDegeriTL;
    const k200 = engine.degerle({ ...bazGirdi, brutM2: 200 }, bazFiyatM2).tahminiPiyasaDegeriTL;

    // Ölçek doğrusal olmak zorunda değil ama monotonik ve makul aralıkta olmalı;
    // iki katı alan yarım kat değer üretiyorsa çarpan zincirinde hata vardır.
    expect(k200).toBeGreaterThan(k100 * 1.5);
    expect(k200).toBeLessThanOrEqual(k100 * 2.5);
  });
});
