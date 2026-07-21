/**
 * gelecek-deger-skoru birim testleri — Faz A1
 */
import { describe, it, expect } from "vitest";
import {
  gelecekDegerHesapla,
  yillikNominalBeklenti,
  gelecekSkorRenk,
  type GelecekDegerGirdi,
} from "../src/lib/gelecek-deger-skoru";

const BAZA: GelecekDegerGirdi = {
  bugunTlm2: 10_000,
  parselM2: 500,
  trendYillikDegisimYuzde: 35,
  gelisimSkoru: 20,
  yatirimSkoru: 60,
  emsal: 1.0,
  taks: 0.3,
  imarTipi: "konut",
  guvenSkoru: 75,
};

describe("gelecekDegerHesapla", () => {
  it("tüm girdi sağlandığında sonuç 0–100 arasında", () => {
    const s = gelecekDegerHesapla(BAZA);
    expect(s.skor).toBeGreaterThanOrEqual(0);
    expect(s.skor).toBeLessThanOrEqual(100);
  });

  it("4 bileşen döner", () => {
    const s = gelecekDegerHesapla(BAZA);
    expect(s.bilesenler).toHaveLength(4);
    expect(s.bilesenler.map((b) => b.id)).toContain("trend");
    expect(s.bilesenler.map((b) => b.id)).toContain("uydu");
    expect(s.bilesenler.map((b) => b.id)).toContain("imar");
    expect(s.bilesenler.map((b) => b.id)).toContain("bugun");
  });

  it("3 ufuk döner (3/5/10 yıl)", () => {
    const s = gelecekDegerHesapla(BAZA);
    expect(s.ufuklar.map((u) => u.yil)).toEqual([3, 5, 10]);
  });

  it("bugunTlm2 null ise ufuk tlm2 null", () => {
    const s = gelecekDegerHesapla({ ...BAZA, bugunTlm2: null });
    expect(s.ufuklar[0]!.tlm2).toBeNull();
    expect(s.ufuklar[0]!.toplamTl).toBeNull();
  });

  it("bugunTlm2 > 0 ise +5y ufuk bugünden büyük (pozitif büyüme beklentisi)", () => {
    const s = gelecekDegerHesapla(BAZA);
    const u5 = s.ufuklar.find((u) => u.yil === 5)!;
    expect(u5.tlm2).not.toBeNull();
    expect(u5.tlm2!).toBeGreaterThan(BAZA.bugunTlm2!);
  });

  it("toplam TL = tlm2 × parselM2", () => {
    const s = gelecekDegerHesapla(BAZA);
    const u3 = s.ufuklar[0]!;
    if (u3.tlm2 && BAZA.parselM2) {
      // Yaklaşık eşitlik (yuvarlama nedeniyle ±1)
      expect(Math.abs(u3.toplamTl! - u3.tlm2 * BAZA.parselM2!)).toBeLessThanOrEqual(1);
    }
  });

  it("etiket skor ile tutarlı", () => {
    const s = gelecekDegerHesapla(BAZA);
    if (s.skor >= 80) expect(s.etiket).toBe("Agresif büyüme");
    else if (s.skor >= 65) expect(s.etiket).toBe("Güçlü büyüme");
    else if (s.skor >= 50) expect(s.etiket).toBe("Dengeli büyüme");
    else if (s.skor >= 35) expect(s.etiket).toBe("Temkinli");
    else expect(s.etiket).toBe("Zayıf beklenti");
  });

  it("tarım imarı düşük imar puanı alır", () => {
    const s = gelecekDegerHesapla({ ...BAZA, imarTipi: "tarim", emsal: 0 });
    const imar = s.bilesenler.find((b) => b.id === "imar")!;
    expect(imar.puan).toBeLessThan(15);
  });

  it("ticari imar yüksek imar puanı alır", () => {
    const s = gelecekDegerHesapla({ ...BAZA, imarTipi: "ticari", emsal: 2.0 });
    const imar = s.bilesenler.find((b) => b.id === "imar")!;
    expect(imar.puan).toBeGreaterThan(10);
  });

  it("yorum string döner", () => {
    const s = gelecekDegerHesapla(BAZA);
    expect(typeof s.yorum).toBe("string");
    expect(s.yorum.length).toBeGreaterThan(10);
  });

  it("disclaimer içeriyor", () => {
    const s = gelecekDegerHesapla(BAZA);
    // Disclaimer "tavsiye" kelimesini içermeli (tam string platform encoding'e göre farklı olabilir)
    expect(s.disclaimer.toLowerCase()).toContain("tavsiye");
    expect(s.disclaimer.length).toBeGreaterThan(20);
  });
});

describe("yillikNominalBeklenti", () => {
  it("trend verisi varsa trentten türer", () => {
    const y = yillikNominalBeklenti({ ...BAZA, trendYillikDegisimYuzde: 40 });
    expect(y).toBeGreaterThan(35);
    expect(y).toBeLessThanOrEqual(65);
  });

  it("trend yoksa varsayılan ~28 civarı döner", () => {
    const y = yillikNominalBeklenti({ ...BAZA, trendYillikDegisimYuzde: null });
    expect(y).toBeGreaterThan(20);
    expect(y).toBeLessThan(45);
  });

  it("güven düşükse yumuşatılır", () => {
    const yYuksek = yillikNominalBeklenti({ ...BAZA, trendYillikDegisimYuzde: 55, guvenSkoru: 80 });
    const yDusuk  = yillikNominalBeklenti({ ...BAZA, trendYillikDegisimYuzde: 55, guvenSkoru: 20 });
    expect(yDusuk).toBeLessThan(yYuksek);
  });

  it("5–65 arasında clamp", () => {
    const yMax = yillikNominalBeklenti({ ...BAZA, trendYillikDegisimYuzde: 999 });
    const yMin = yillikNominalBeklenti({ ...BAZA, trendYillikDegisimYuzde: -999 });
    expect(yMax).toBeLessThanOrEqual(65);
    expect(yMin).toBeGreaterThanOrEqual(5);
  });
});

describe("gelecekSkorRenk", () => {
  it("80+ yeşil döner", () => {
    expect(gelecekSkorRenk(85)).toBe("#059669");
  });
  it("65-79 mavi döner", () => {
    expect(gelecekSkorRenk(70)).toBe("#0284c7");
  });
  it("35 altı kırmızı döner", () => {
    expect(gelecekSkorRenk(20)).toBe("#dc2626");
  });
});
