import { describe, it, expect } from "vitest";
import {
  hesaplaNdvi,
  hesaplaNdwi,
  hesaplaNdbi,
  hesaplaSavi,
  hesaplaEvi,
  spektralAnalizEt,
  zamansalDegisimAnalizi,
  type SentinelBantlari,
} from "../src/lib/spektral-analiz";

describe("Uzaktan Algılama: spektral-analiz modülü", () => {
  it("NDVI hesaplamasını doğru yapar", () => {
    // Sağlıklı bitki örtüsü: NIR yüksek (0.8), Red düşük (0.1)
    const ndvi = hesaplaNdvi(0.8, 0.1);
    expect(ndvi).toBeCloseTo((0.8 - 0.1) / (0.8 + 0.1), 3);
    expect(ndvi).toBeGreaterThan(0.7);
  });

  it("NDWI hesaplamasını doğru yapar", () => {
    // Su yüzeyi: Green yüksek (0.4), NIR çok düşük (0.05)
    const ndwi = hesaplaNdwi(0.4, 0.05);
    expect(ndwi).toBeGreaterThan(0.5);
  });

  it("NDBI hesaplamasını doğru yapar", () => {
    // Beton/Bina: SWIR yüksek (0.6), NIR orta (0.2)
    const ndbi = hesaplaNdbi(0.6, 0.2);
    expect(ndbi).toBeGreaterThan(0.4);
  });

  it("SAVI ve EVI hesaplamalarını doğru yapar", () => {
    const savi = hesaplaSavi(0.7, 0.2);
    expect(savi).toBeGreaterThan(0.5);

    const evi = hesaplaEvi(0.7, 0.2, 0.1);
    expect(evi).toBeGreaterThan(0.4);
  });

  it("spektralAnalizEt bitki örtüsü sınıflandırmasını doğru belirler", () => {
    const ormanBant: SentinelBantlari = {
      blue: 0.05,
      green: 0.1,
      red: 0.08,
      nir: 0.75,
      swir1: 0.12,
    };
    const sonuc = spektralAnalizEt(ormanBant);
    expect(sonuc.sinif).toBe("yogun-vejetasyon");
    expect(sonuc.vejetasyonSagligi).toBe("mukemmel");
    expect(sonuc.ndvi).toBeGreaterThan(0.6);
  });

  it("zamansalDegisimAnalizi yeni yapılaşmayı doğru tespit eder", () => {
    const t0: SentinelBantlari = {
      blue: 0.05,
      green: 0.15,
      red: 0.1,
      nir: 0.65,
      swir1: 0.15,
    }; // Yeşil arazi
    const t1: SentinelBantlari = {
      blue: 0.12,
      green: 0.15,
      red: 0.25,
      nir: 0.2,
      swir1: 0.55,
    }; // Betonlaşmış arazi

    const degisim = zamansalDegisimAnalizi(t0, t1);
    expect(degisim.durum).toBe("yeni-yapilasma");
    expect(degisim.ciddiyet).toBe("yuksek");
    expect(degisim.deltaNdbi).toBeGreaterThan(0.2);
  });
});