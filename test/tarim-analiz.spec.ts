import { describe, it, expect } from "vitest";
import {
  hesaplaGdd,
  urunUygunlukHesapla,
  tarimAnaliziUret,
  type IklimVerisi,
} from "../src/lib/tarim-analiz";

describe("AgriTech: tarim-analiz modülü", () => {
  it("hesaplaGdd büyüme derece günlerini doğru hesaplar", () => {
    // 365 gün, her gün 20°C (Base 10 -> gün başına 10 GDD -> 3650 GDD)
    const tmean = Array.from({ length: 365 }, () => 20);
    const gdd = hesaplaGdd(tmean, 10);
    expect(gdd).toBeCloseTo(3650, -1);
  });

  it("Akdeniz ikliminde Zeytin ve Narenciye yüksek uygunluk alır", () => {
    const akdenizIklimi: IklimVerisi = {
      yillikYagisMm: 800,
      ortSicaklikC: 19.5,
      enSicakAyOrt: 28,
      enSogukAyOrt: 11,
      donluGunSayisi: 1,
      rakimM: 150,
      gddDereceGun: 3200,
      donemBaslangic: "2021-01-01",
      donemBitis: "2026-01-01",
      veriKaynagi: "Test",
    };

    const analiz = tarimAnaliziUret(akdenizIklimi, 5);
    expect(analiz.iklimKusagi).toContain("Akdeniz");
    expect(analiz.donmaRiski).toBe("düşük");

    const zeytin = analiz.oneriUrunler.find((u) => u.urun.includes("Zeytin"));
    const narenciye = analiz.oneriUrunler.find((u) => u.urun.includes("Narenciye"));
    expect(zeytin?.uygunluk).toBe("yuksek");
    expect(narenciye?.uygunluk).toBe("yuksek");
    expect(zeytin?.netGelirTlDonum).toBeGreaterThan(20_000);
  });

  it("Doğu Anadolu soğuk yaylada Narenciye uygunsuz çıkar", () => {
    const sogukIklim: IklimVerisi = {
      yillikYagisMm: 450,
      ortSicaklikC: 6.0,
      enSicakAyOrt: 19,
      enSogukAyOrt: -8,
      donluGunSayisi: 110,
      rakimM: 1850,
      gddDereceGun: 1100,
      donemBaslangic: "2021-01-01",
      donemBitis: "2026-01-01",
      veriKaynagi: "Test",
    };

    const urunler = urunUygunlukHesapla(sogukIklim, 10);
    const narenciye = urunler.find((u) => u.urun.includes("Narenciye"));
    expect(narenciye?.uygunluk).toBe("uygunsuz");

    const bugday = urunler.find((u) => u.urun.includes("Buğday"));
    expect(bugday?.uygunlukSkoruYuzde).toBeGreaterThan(50);
  });
});