import { describe, it, expect } from "vitest";
import { degerBandiGeometri } from "../src/sidepanel/components/DegerBandi";

const yap = (alt: number, bek: number, ust: number, guven: number) =>
  degerBandiGeometri({ altPerM2: alt, beklenenPerM2: bek, ustPerM2: ust, guvenSkoru: guven });

describe("degerBandiGeometri", () => {
  it("yüksek güven → dar bant + emsal seviyesi", () => {
    const g = yap(11000, 12500, 14000, 84);
    expect(g.seviye).toBe("yuksek");
    expect(g.segmentAdet).toBe(4); // round(84/20)
    // beklenen referans ölçekte tam ortada
    expect(g.markLeft).toBeCloseTo(50, 5);
    // dar bant → fill kenar boşlukları büyük
    expect(g.fillLeft).toBeGreaterThan(30);
    expect(g.fillRight).toBeGreaterThan(30);
  });

  it("düşük güven + geniş aralık → geniş bant + 'manuel doğrula'", () => {
    const dar = yap(11000, 12500, 14000, 84);
    const genis = yap(5000, 12500, 20000, 38);
    expect(genis.seviye).toBe("dusuk");
    // geniş aralık → fill kenar boşlukları küçük (bant daha çok yer kaplar)
    expect(genis.fillLeft).toBeLessThan(dar.fillLeft);
    expect(genis.fillRight).toBeLessThan(dar.fillRight);
  });

  it("seviye eşikleri: 65+ yüksek, 45-64 orta, <45 düşük", () => {
    expect(yap(1, 100, 1, 65).seviye).toBe("yuksek");
    expect(yap(1, 100, 1, 64).seviye).toBe("orta");
    expect(yap(1, 100, 1, 45).seviye).toBe("orta");
    expect(yap(1, 100, 1, 44).seviye).toBe("dusuk");
  });

  it("bant referans ölçeğin dışına taşmaz (0-100 clamp)", () => {
    const g = yap(1000, 12500, 99999, 20); // üst referansı aşıyor
    expect(g.fillLeft).toBeGreaterThanOrEqual(0);
    expect(g.fillRight).toBeGreaterThanOrEqual(0);
    expect(g.fillLeft).toBeLessThanOrEqual(100);
  });

  it("segment adedi 0-5 arası clamp", () => {
    expect(yap(1, 100, 1, 0).segmentAdet).toBe(0);
    expect(yap(1, 100, 1, 100).segmentAdet).toBe(5);
  });
});
