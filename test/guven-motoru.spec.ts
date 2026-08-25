import { describe, it, expect } from "vitest";
import { guvenSkoruTavani } from "../src/lib/fiyat/guven-motoru";

describe("Fiyat: guven-motoru modülü", () => {
  it("guvenSkoruTavani kaynak zayıflığına göre tavan puanı sınırlar", () => {
    expect(guvenSkoruTavani("spatial-radius")).toBe(98);
    expect(guvenSkoruTavani("ilanGozlem-mahalle")).toBe(98);
    expect(guvenSkoruTavani("ilanGozlem-ilce")).toBe(88);
    expect(guvenSkoruTavani("mahalle-baseline")).toBe(90);
    expect(guvenSkoruTavani("ilce-semt-baseline")).toBe(80);
    expect(guvenSkoruTavani("ilce-baseline")).toBe(70);
    expect(guvenSkoruTavani("il-baseline")).toBe(55);
    expect(guvenSkoruTavani("fallback")).toBe(40);
  });
});