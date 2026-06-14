/**
 * Deprem zonu lookup + çarpan
 */
import { describe, it, expect } from "vitest";
import { depremRiskiGetir, depremCarpani } from "../src/lib/data/deprem-zonlari";

describe("depremRiskiGetir", () => {
  it("İstanbul için Z1 döner", () => {
    const r = depremRiskiGetir("istanbul");
    expect(r?.zon).toBe("Z1");
    expect(r?.pga).toBeGreaterThan(0.4);
    expect(r?.fay).toContain("Anadolu");
  });

  it("Kahramanmaraş Z1 (DAF)", () => {
    const r = depremRiskiGetir("kahramanmaras");
    expect(r?.zon).toBe("Z1");
    expect(r?.pga).toBeGreaterThanOrEqual(0.5);
  });

  it("İç Anadolu illeri düşük zon", () => {
    const r = depremRiskiGetir("nigde");
    // Z3-Z5 arası bekliyoruz (kaynaklara göre)
    if (r) expect(["Z3", "Z4", "Z5"]).toContain(r.zon);
  });

  it("bilinmeyen il için null döner", () => {
    expect(depremRiskiGetir("yokboyleil")).toBe(null);
    expect(depremRiskiGetir(null)).toBe(null);
    expect(depremRiskiGetir(undefined)).toBe(null);
  });
});

describe("depremCarpani", () => {
  it("Z1 için indirim çarpanı (<1)", () => {
    expect(depremCarpani("Z1")).toBeLessThan(1);
  });

  it("Z5 için prim çarpanı (>=1)", () => {
    expect(depremCarpani("Z5")).toBeGreaterThanOrEqual(1);
  });

  it("null için 1.0 (nötr)", () => {
    expect(depremCarpani(null)).toBe(1);
  });
});
