/**
 * Manuel veri lib — imarBirlestir testleri
 * (Storage fonksiyonları chrome.storage'a bağlı, integration test gerek — burada sadece pure logic)
 */
import { describe, it, expect } from "vitest";
import { imarBirlestir } from "../src/lib/manuel-veri";
import type { EPlanImarVerisi } from "../src/lib/eplan";

const ePlanBos: EPlanImarVerisi = {
  parselKey: "x", kaynakUrl: "test", yakalandiAt: 1000,
  ilAd: "Konya", ilceAd: "Meram", mahalleAd: "Cukurcimen",
  adaNo: 138, parselNo: 19, pin: null,
  kullanimKarari: null, planKarari: null, planNotu: null,
  yapiNizami: null, emsal: null, taks: null, maksKat: null,
  hamMetin: [], guvenSkoru: 50,
};

describe("imarBirlestir", () => {
  it("hem ePlan hem manuel yoksa null döner", () => {
    expect(imarBirlestir(null, undefined)).toBe(null);
  });

  it("sadece ePlan varsa ePlan değerlerini döner", () => {
    const ePlan = { ...ePlanBos, taks: 0.4, emsal: 1.5, maksKat: 5 };
    const r = imarBirlestir(ePlan, undefined);
    expect(r?.taks).toBe(0.4);
    expect(r?.emsal).toBe(1.5);
    expect(r?.maksKat).toBe(5);
    expect(r?.manuelGirildi).toBe(false);
    expect(r?.alanKaynaklari?.taks).toBe("eplan");
  });

  it("sadece manuel varsa manuel değerlerini döner", () => {
    const r = imarBirlestir(null, { taks: 0.3, emsal: 0.9, girilmeTarihi: Date.now() });
    expect(r?.taks).toBe(0.3);
    expect(r?.emsal).toBe(0.9);
    expect(r?.manuelGirildi).toBe(true);
    expect(r?.alanKaynaklari?.taks).toBe("manuel");
  });

  it("manuel ePlan'ı alan-bazında override eder", () => {
    const ePlan = { ...ePlanBos, taks: 0.4, emsal: 1.5, maksKat: 5 };
    const r = imarBirlestir(ePlan, { taks: 0.6, girilmeTarihi: Date.now() });
    // TAKS manuel
    expect(r?.taks).toBe(0.6);
    expect(r?.alanKaynaklari?.taks).toBe("manuel");
    // Emsal yine ePlan
    expect(r?.emsal).toBe(1.5);
    expect(r?.alanKaynaklari?.emsal).toBe("eplan");
    // Maks kat yine ePlan
    expect(r?.maksKat).toBe(5);
  });

  it("manuel boş string alanları override etmez", () => {
    const ePlan = { ...ePlanBos, yapiNizami: "Bitişik", emsal: 1.5 };
    const r = imarBirlestir(ePlan, { yapiNizami: "", emsal: 2.0, girilmeTarihi: Date.now() });
    // Boş string ePlan'ı override etmez (eski yapiNizami korunur)
    expect(r?.yapiNizami).toBe("Bitişik");
    // Emsal değişti
    expect(r?.emsal).toBe(2.0);
  });
});
