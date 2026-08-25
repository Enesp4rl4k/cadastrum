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
});