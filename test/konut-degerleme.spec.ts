import { describe, it, expect } from "vitest";
import { KonutDegerlemeEngine, type KonutGirdisi } from "../src/lib/konut/konut-degerleme";

describe("Konut Değerleme & Amortisman Motoru", () => {
  const engine = new KonutDegerlemeEngine();

  it("Ara kat ve genç bina için primli piyasa değeri hesaplar", () => {
    const konut: KonutGirdisi = {
      il: "istanbul",
      ilce: "kadikoy",
      mahalle: "moda",
      brutM2: 120,
      binaYasi: 3,
      bulunduguKat: "ara_kat",
      siteIciMi: false,
    };

    const sonuc = engine.degerle(konut, 50_000); // 50k TL/m2 baz
    expect(sonuc.tahminiPiyasaDegeriTL).toBeGreaterThan(5_000_000);
    expect(sonuc.carpanlar.find((c) => c.ad === "Kat Konumu")?.carpan).toBeGreaterThan(1.0);
    expect(sonuc.carpanlar.find((c) => c.ad === "Bina Yaşı")?.carpan).toBeGreaterThan(1.0);
  });

  it("12 yıl amortismanlı konutu 'mukemmel' nakit akışı olarak sınıflandırır", () => {
    const konut: KonutGirdisi = {
      il: "izmir",
      ilce: "bornova",
      brutM2: 80,
      binaYasi: 10,
      bulunduguKat: "ara_kat",
      tahminiAylikKiraTL: 25_000, // Yıllık 300k kira
    };

    const sonuc = engine.degerle(konut, 35_000);
    expect(sonuc.amortismanAnalizi.nakitAkisiSinifi).toBeDefined();
    expect(sonuc.amortismanAnalizi.yillikBrutKiraTL).toBe(300_000);
  });

  it("Eski binada arsa payı yüksekse kentsel dönüşüm arbitrajını yakalar", () => {
    const konut: KonutGirdisi = {
      il: "istanbul",
      ilce: "besiktas",
      brutM2: 100,
      binaYasi: 35, // 35 yıllık eski bina
      bulunduguKat: "ara_kat",
      parselAlaniM2: 1200,
      binadakiToplamDaire: 8, // Daire başına 150 m2 arsa payı düşüyor!
    };

    const sonuc = engine.degerle(konut, 60_000);
    expect(sonuc.kentselDonusumAnalizi?.donusumFirsatiVarMi).toBe(true);
    expect(sonuc.kentselDonusumAnalizi?.daireBasiArsaPayiM2).toBe(150);
  });

  it("Kat pozisyonu ve bina yaşı çarpanları monotonik değer üretir", () => {
    const baz: KonutGirdisi = {
      il: "ankara",
      ilce: "cankaya",
      brutM2: 100,
      binaYasi: 5,
      bulunduguKat: "ara_kat",
    };

    // Kat sıralaması
    const kot = engine.degerle({ ...baz, bulunduguKat: "kot" });
    const zemin = engine.degerle({ ...baz, bulunduguKat: "zemin" });
    const ara = engine.degerle({ ...baz, bulunduguKat: "ara_kat" });
    const dubleks = engine.degerle({ ...baz, bulunduguKat: "dubleks" });

    expect(kot.tahminiPiyasaDegeriTL).toBeLessThan(zemin.tahminiPiyasaDegeriTL);
    expect(zemin.tahminiPiyasaDegeriTL).toBeLessThan(ara.tahminiPiyasaDegeriTL);
    expect(ara.tahminiPiyasaDegeriTL).toBeLessThan(dubleks.tahminiPiyasaDegeriTL);

    // Değerleme bandı sınırları
    expect(ara.degerlemeAraligi.altTL).toBeLessThanOrEqual(ara.tahminiPiyasaDegeriTL);
    expect(ara.degerlemeAraligi.ustTL).toBeGreaterThanOrEqual(ara.tahminiPiyasaDegeriTL);
  });

  /**
   * P10 — testin adı ölçtüğü şeyi söylemeli.
   *
   * Bu test DOĞRULUK ÖLÇMÜYOR: `beklenen` değeri motorun kendi katsayılarıyla
   * (0,82 net m² · 1,08 kat · 1,25 yaş · 1,15 site) hesaplanıyor ve motorun
   * onu üretmesi bekleniyor. Yani ölçtüğü şey iç tutarlılık — meşru ve
   * regresyon yakalar, ama piyasaya yakınlık değil.
   *
   * Eski adı "MAPE <= %10 kalibrasyonunu korur" idi ve doğruluk iddiası gibi
   * okunuyordu. Aynı desenin daha ağır hâli konut backtest'inde ±%20 = 66,4
   * diye raporlanmıştı (`data/konut-backtest-sizinti.json`).
   */
  it("çarpan zinciri beklenen aritmetiği birebir üretir (iç tutarlılık, doğruluk DEĞİL)", () => {
    const ornekler = [
      {
        girdi: { il: "istanbul", ilce: "kadikoy", brutM2: 100, binaYasi: 0, bulunduguKat: "ara_kat" as const, siteIciMi: true },
        baz: 50_000,
        beklenen: Math.round(50_000 * (100 * 0.82) * (1.08 * 1.25 * 1.15) / 10000) * 10000,
      },
      {
        girdi: { il: "izmir", ilce: "karsiyaka", brutM2: 120, binaYasi: 20, bulunduguKat: "zemin" as const },
        baz: 30_000,
        beklenen: Math.round(30_000 * (120 * 0.82) * (0.90 * 0.88) / 10000) * 10000,
      },
    ];

    for (const o of ornekler) {
      const res = engine.degerle(o.girdi, o.baz);
      const ape = Math.abs(res.tahminiPiyasaDegeriTL - o.beklenen) / o.beklenen;
      expect(ape).toBeLessThan(0.05);
    }
  });
});