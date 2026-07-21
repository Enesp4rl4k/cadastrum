/**
 * imar-degisim-sinyal birim testleri — Faz C1
 */
import { describe, it, expect } from "vitest";
import { imarDegisimHesapla, imarDegisimRenk } from "../src/lib/imar-degisim-sinyal";

describe("imarDegisimHesapla", () => {
  it("tüm girdi null ise skor 0–100 arasında ve geçerli olasılık döner", () => {
    const s = imarDegisimHesapla({});
    expect(s.skor).toBeGreaterThanOrEqual(0);
    expect(s.skor).toBeLessThanOrEqual(100);
    // Fallback puanları (10+7+5+5+5=32) → "orta" veya "dusuk" — ikisi de geçerli
    expect(["dusuk", "orta"]).toContain(s.olasılik);
  });

  it("5 bileşen döner", () => {
    const s = imarDegisimHesapla({});
    expect(s.bilesenler).toHaveLength(5);
    const ids = s.bilesenler.map((b) => b.id);
    expect(ids).toContain("gelisim");
    expect(ids).toContain("satis");
    expect(ids).toContain("emsal");
    expect(ids).toContain("cdp");
    expect(ids).toContain("imar");
  });

  it("yüksek gelişim skoru → yüksek puan", () => {
    const s = imarDegisimHesapla({ gelisimSkoru: 80 });
    const gelisim = s.bilesenler.find((b) => b.id === "gelisim")!;
    expect(gelisim.puan).toBeGreaterThan(20);
  });

  it("düşük gelişim skoru → düşük puan", () => {
    const s = imarDegisimHesapla({ gelisimSkoru: -50 });
    const gelisim = s.bilesenler.find((b) => b.id === "gelisim")!;
    expect(gelisim.puan).toBeLessThan(10);
  });

  it("tarım imarı → yüksek imar potansiyel puanı", () => {
    const s = imarDegisimHesapla({ imarTipi: "tarim" });
    const imar = s.bilesenler.find((b) => b.id === "imar")!;
    expect(imar.puan).toBeGreaterThanOrEqual(10);
  });

  it("ticari imar → düşük imar potansiyel puanı (zaten yüksek)", () => {
    const s = imarDegisimHesapla({ imarTipi: "ticari" });
    const imar = s.bilesenler.find((b) => b.id === "imar")!;
    expect(imar.puan).toBeLessThanOrEqual(5);
  });

  it("yakın ÇDP mesafesi → yüksek cdp puanı", () => {
    const s = imarDegisimHesapla({ cdpMesafeKm: 0.5 });
    const cdp = s.bilesenler.find((b) => b.id === "cdp")!;
    expect(cdp.puan).toBeGreaterThan(10);
  });

  it("uzak ÇDP mesafesi → düşük cdp puanı", () => {
    const s = imarDegisimHesapla({ cdpMesafeKm: 20 });
    const cdp = s.bilesenler.find((b) => b.id === "cdp")!;
    expect(cdp.puan).toBe(0);
  });

  it("tüm sinyaller güçlüyse yuksek olasılık", () => {
    const s = imarDegisimHesapla({
      gelisimSkoru: 80,
      tkgmSatisYogunlugu: 0.1,
      komsuemsalDegisimYuzde: 50,
      cdpMesafeKm: 0.5,
      imarTipi: "tarim",
      bolgeselTrendYuzde: 30,
    });
    expect(s.olasılik).toBe("yuksek");
    expect(s.skor).toBeGreaterThanOrEqual(60);
  });

  it("gerekce string döner", () => {
    const s = imarDegisimHesapla({ gelisimSkoru: 30 });
    expect(typeof s.gerekce).toBe("string");
    expect(s.gerekce.length).toBeGreaterThan(10);
  });

  it("disclaimer içeriyor", () => {
    const s = imarDegisimHesapla({});
    expect(s.disclaimer).toContain("belediye");
  });

  it("skor puan toplamıyla tutarlı (max 100)", () => {
    for (const gs of [-100, 0, 50, 100]) {
      const s = imarDegisimHesapla({ gelisimSkoru: gs });
      const toplamPuan = s.bilesenler.reduce((acc, b) => acc + b.puan, 0);
      expect(s.skor).toBe(Math.min(100, Math.max(0, toplamPuan)));
    }
  });
});

describe("imarDegisimRenk", () => {
  it("yuksek → yeşil", () => {
    expect(imarDegisimRenk("yuksek")).toBe("#059669");
  });
  it("orta → amber", () => {
    expect(imarDegisimRenk("orta")).toBe("#d97706");
  });
  it("dusuk → gri", () => {
    expect(imarDegisimRenk("dusuk")).toBe("#6b7280");
  });
});
