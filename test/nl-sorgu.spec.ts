import { describe, it, expect } from "vitest";
import { nlParse } from "../src/lib/nl-sorgu";

describe("nlParse", () => {
  it("il + ilçe + kategori tespit eder", () => {
    const r = nlParse("İstanbul Beykoz arsa");
    expect(r.ilNorm).toBe("istanbul");
    expect(r.ilceNorm).toBe("beykoz");
    expect(r.kategori).toBe("arsa");
  });

  it("ilçe sözcüğünden il çıkarır", () => {
    const r = nlParse("Bodrum villa");
    expect(r.ilceNorm).toBe("bodrum");
    expect(r.ilNorm).toBe("mugla");
    expect(r.kategori).toBe("konut");
  });

  it("'5M altı' → maksFiyat 5_000_000", () => {
    const r = nlParse("Beykoz arsa 5M altı");
    expect(r.maksFiyat).toBe(5_000_000);
  });

  it("'2 milyon üstü' → minFiyat 2_000_000", () => {
    const r = nlParse("Bodrum daire 2 milyon üstü");
    expect(r.minFiyat).toBe(2_000_000);
  });

  it("'1000m² üstü' → minM2 1000", () => {
    const r = nlParse("İstanbul arsa 1000m² üstü");
    expect(r.minM2).toBe(1000);
  });

  it("kategori yoksa undefined", () => {
    const r = nlParse("Ankara");
    expect(r.kategori).toBeUndefined();
  });

  it("modifier 'sahile yakın' → sahilYakini true", () => {
    const r = nlParse("Muğla sahile yakın arsa");
    expect(r.sahilYakini).toBe(true);
  });

  it("bilinmeyen metin → tüm alanlar undefined", () => {
    const r = nlParse("falanca filanca");
    expect(r.kategori).toBeUndefined();
    expect(r.ilNorm).toBeFalsy();
    expect(r.maksFiyat).toBeUndefined();
  });

  it("'500k bütçe' → maksFiyat 500_000", () => {
    const r = nlParse("Konya arsa 500k bütçe");
    expect(r.maksFiyat).toBe(500_000);
  });
});
