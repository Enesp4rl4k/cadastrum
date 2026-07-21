import { describe, it, expect } from "vitest";
import { skorlaMetrikler, type YilMetrik } from "../src/lib/gelisim-trendi";

function y(yil: number, builtUp: number, veg: number): YilMetrik {
  return { yil, releaseId: 0, builtUp, veg, lum: 0.5 };
}

describe("skorlaMetrikler", () => {
  it("yapılaşma artışında pozitif skor üretir", () => {
    const r = skorlaMetrikler([
      y(2014, 0.1, 0.4),
      y(2017, 0.15, 0.35),
      y(2020, 0.35, 0.2),
      y(2024, 0.45, 0.15),
    ]);
    expect(r.skor).toBeGreaterThan(12);
    expect(r.etiket).toMatch(/gelişim|yapılaşma/i);
    expect(r.guven).toBe("yuksek");
  });

  it("durağan yüzeyde düşük mutlak skor verir", () => {
    const r = skorlaMetrikler([
      y(2014, 0.2, 0.3),
      y(2017, 0.21, 0.29),
      y(2020, 0.2, 0.3),
      y(2024, 0.22, 0.28),
    ]);
    expect(Math.abs(r.skor)).toBeLessThan(20);
  });

  it("tek yılda yetersiz veri döner", () => {
    const r = skorlaMetrikler([y(2024, 0.3, 0.2)]);
    expect(r.etiket).toBe("Yetersiz veri");
    expect(r.guven).toBe("dusuk");
  });
});
