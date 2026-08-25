import { describe, it, expect } from "vitest";
import {
  gesTopografyaDegerlendir,
  pvProjeksiyonHesapla,
} from "../src/lib/gunes-enerjisi";

describe("CleanTech: gunes-enerjisi modülü", () => {
  it("gesTopografyaDegerlendir bakı yönüne göre çarpanı doğru belirler", () => {
    const guney = gesTopografyaDegerlendir(3, "G");
    expect(guney.bakiCarpani).toBe(1.0);
    expect(guney.egimUygunlugu).toBe("ideal");

    const kuzey = gesTopografyaDegerlendir(15, "K");
    expect(kuzey.bakiCarpani).toBe(0.72);
    expect(kuzey.egimUygunlugu).toBe("zorlu-tesviye");
  });

  it("pvProjeksiyonHesapla LCOE ve 25 yıllık NPV simülasyonunu doğru hesaplar", () => {
    const sonuc = pvProjeksiyonHesapla(10_000, 1500, {
      kaplamaOrani: 0.5,
      tarifeTlPerKwh: 3.2,
      kurulumTlPerKwp: 28_000,
    });

    // 10.000m2 * 0.5 = 5.000m2 panel alanı. 5.000 * 0.18 = 900 kWp
    expect(sonuc.kuruluKwp).toBe(900);
    // 900 kWp * 1500 kWh/kWp = 1.350.000 kWh
    expect(sonuc.yillikUretimKwh).toBe(1_350_000);
    expect(sonuc.geriOdemeYil).toBeGreaterThan(4);
    expect(sonuc.geriOdemeYil).toBeLessThan(10);
    expect(sonuc.lcoeTlKwh).toBeGreaterThan(0.5);
    expect(sonuc.lcoeTlKwh).toBeLessThan(sonuc.yillikGelirTl / sonuc.yillikUretimKwh);
    expect(sonuc.npv25YilTl).toBeGreaterThan(0);
    expect(sonuc.toplamUretim25YilMwh).toBeGreaterThan(25_000);
  });
});