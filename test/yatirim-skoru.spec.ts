/**
 * Yatırım skoru + ROI birim testleri.
 */
import { describe, it, expect } from "vitest";
import { yatirimSkoruHesapla } from "../src/lib/yatirim-skoru";
import { roiHesapla } from "../src/lib/yatirim-roi";
import { kiraTahminiHesapla } from "../src/lib/kira-getirisi";
import type { Parsel } from "../src/types/tkgm";

const parselBase: Parsel = {
  ilAd: "İstanbul",
  ilceAd: "Beykoz",
  mahalleAd: "Akbaba",
  nitelik: "Arsa",
  alan: 1000,
  adaNo: 1,
  parselNo: 1,
  mahalleKodu: 1,
  ilceKodu: 1,
  ilKodu: 34,
  merkezNokta: { lat: 41.10, lng: 29.15 },
  polygon: { type: "Polygon", coordinates: [[]] },
} as unknown as Parsel;

describe("yatirimSkoruHesapla", () => {
  it("fiyat/cevre/ePlan boş → orta seviye skor (40-60)", () => {
    const s = yatirimSkoruHesapla({ parsel: parselBase, fiyat: null, cevre: null, ePlan: null });
    expect(s.toplam).toBeGreaterThan(20);
    expect(s.toplam).toBeLessThan(70);
    expect(s.boyutlar).toHaveLength(6);
  });

  it("seviye eşikleri tutarlı", () => {
    const s = yatirimSkoruHesapla({ parsel: parselBase, fiyat: null, cevre: null, ePlan: null });
    if (s.toplam >= 80) expect(s.seviye).toBe("mukemmel");
    else if (s.toplam >= 65) expect(s.seviye).toBe("iyi");
    else if (s.toplam >= 45) expect(s.seviye).toBe("orta");
    else if (s.toplam >= 30) expect(s.seviye).toBe("zayif");
    else expect(s.seviye).toBe("riskli");
  });

  it("Hatay parseli için risk boyutu düşer (Z1 deprem)", () => {
    const p = { ...parselBase, ilAd: "Hatay" };
    const s = yatirimSkoruHesapla({ parsel: p, fiyat: null, cevre: null, ePlan: null });
    const risk = s.boyutlar.find((b) => b.ad === "Risk")!;
    expect(risk.skor).toBeLessThan(50);
  });

  it("Sivas parseli için risk boyutu daha yüksek", () => {
    const p = { ...parselBase, ilAd: "Sivas" };
    const s = yatirimSkoruHesapla({ parsel: p, fiyat: null, cevre: null, ePlan: null });
    const risk = s.boyutlar.find((b) => b.ad === "Risk")!;
    expect(risk.skor).toBeGreaterThanOrEqual(50);
  });
});

describe("roiHesapla", () => {
  it("kira null → brut/cap null, IRR sadece değer artışıyla", () => {
    const r = roiHesapla({ fiyat: 1_000_000, yillikKira: null });
    expect(r.brutKiraGetirisi).toBeNull();
    expect(r.capRate).toBeNull();
    expect(r.irr10y).not.toBeNull();
    expect(r.irr10y).toBeGreaterThan(0); // değer artışı varsayılan %30/yıl
  });

  it("brut kira getirisi doğru hesap", () => {
    const r = roiHesapla({ fiyat: 1_000_000, yillikKira: 60_000 });
    expect(r.brutKiraGetirisi).toBeCloseTo(6, 1);
  });

  it("cap rate gross getiriden düşük (gider düşülür)", () => {
    const r = roiHesapla({ fiyat: 1_000_000, yillikKira: 60_000 });
    expect(r.capRate).toBeLessThan(r.brutKiraGetirisi!);
  });

  it("fiyat sıfır/negatif → null guards", () => {
    const r = roiHesapla({ fiyat: 0, yillikKira: 10_000 });
    expect(r.brutKiraGetirisi).toBeNull();
    expect(r.irr10y).toBeNull();
  });

  it("IRR > 0 ve makul aralıkta (1-100 arası)", () => {
    const r = roiHesapla({ fiyat: 1_000_000, yillikKira: 50_000 });
    expect(r.irr10y).not.toBeNull();
    expect(r.irr10y!).toBeGreaterThan(0);
    expect(r.irr10y!).toBeLessThan(100);
  });
});

describe("kiraTahminiHesapla", () => {
  it("arsa için null", () => {
    expect(kiraTahminiHesapla(parselBase)).toBeNull();
  });
  it("konut için tahmin döner", () => {
    const p = { ...parselBase, nitelik: "Mesken konut", alan: 100 };
    const k = kiraTahminiHesapla(p);
    expect(k).not.toBeNull();
    expect(k!.aylikKira).toBeGreaterThan(0);
    expect(k!.yillikKira).toBe(k!.aylikKira * 12);
  });
});
