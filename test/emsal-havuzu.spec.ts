import { describe, it, expect } from "vitest";
import {
  yasAgirligi,
  weightedAverage,
  weightedMedian,
  clamp,
  manuelEmsaliIlanaCevir,
} from "../src/lib/fiyat/emsal-havuzu";
import type { Parsel } from "../src/types/tkgm";
import type { ManuelEmsal } from "../src/lib/manuel-veri";

describe("Fiyat: emsal-havuzu modülü", () => {
  it("clamp min ve max sınırlarını doğru korur", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it("yasAgirligi sürekli eksponansiyel decay üretir", () => {
    const now = Date.now();
    const gun = 86_400_000;
    expect(yasAgirligi(now)).toBeCloseTo(1.0, 2);
    expect(yasAgirligi(now - 60 * gun)).toBeCloseTo(0.5, 2);
    expect(yasAgirligi(now - 120 * gun)).toBeCloseTo(0.25, 2);
    expect(yasAgirligi(now - 200 * gun)).toBe(0);
  });

  it("weightedAverage ağırlıklı ortalamayı doğru hesaplar", () => {
    const vals = [
      { value: 100, weight: 1 },
      { value: 200, weight: 3 },
    ];
    expect(weightedAverage(vals)).toBe(175);
  });

  it("weightedMedian ağırlıklı medyanı doğru bulur", () => {
    const vals = [
      { value: 100, weight: 1 },
      { value: 200, weight: 2 },
      { value: 300, weight: 1 },
    ];
    expect(weightedMedian(vals)).toBe(200);
  });

  it("manuelEmsaliIlanaCevir parsel ve manuel emsali IlanGozlem'e dönüştürür", () => {
    const parsel: Parsel = {
      id: 1,
      ilAd: "İstanbul",
      ilceAd: "Kadıköy",
      mahalleAd: "Fenerbahçe",
      alan: 500,
      nitelik: "Arsa",
      adaNo: "101",
      parselNo: "5",
      mevkii: null,
      pafta: null,
      guncellemeTarihi: null,
      geometri: null,
      merkezNokta: null,
      zn: null,
    };
    const manuel: ManuelEmsal = {
      id: "emsal-123",
      kategori: "arsa",
      fiyatTL: 5_000_000,
      m2: 500,
      fiyatPerM2: 10_000,
      girilmeTarihi: Date.now(),
    };
    const ilan = manuelEmsaliIlanaCevir(parsel, manuel);
    expect(ilan.fiyatPerM2).toBe(10_000);
    expect(ilan.ilAd).toBe("İstanbul");
    expect(ilan.ilanNo).toContain("manuel-");
  });
});