/**
 * Koordinat bazlı deprem risk — PGA bantları, zon eşleştirme, AFAD fallback.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { pgaCarpani, pgaToZon, depremRiskKoordGetir } from "../src/lib/deprem-tdth";

describe("pgaToZon", () => {
  it("Z1 sınırı (>= 0.40g)", () => {
    expect(pgaToZon(0.55)).toBe("Z1");
    expect(pgaToZon(0.40)).toBe("Z1");
  });
  it("Z2 bandı (0.30-0.40)", () => {
    expect(pgaToZon(0.35)).toBe("Z2");
    expect(pgaToZon(0.30)).toBe("Z2");
  });
  it("Z3 (0.20-0.30)", () => {
    expect(pgaToZon(0.25)).toBe("Z3");
  });
  it("Z4 (0.10-0.20)", () => {
    expect(pgaToZon(0.15)).toBe("Z4");
  });
  it("Z5 (< 0.10)", () => {
    expect(pgaToZon(0.05)).toBe("Z5");
  });
});

describe("pgaCarpani", () => {
  it("yıkıcı bölge (>=0.50g) en düşük çarpan", () => {
    expect(pgaCarpani(0.55)).toBe(0.93);
  });
  it("Z1 bandı 0.95", () => {
    expect(pgaCarpani(0.42)).toBe(0.95);
  });
  it("Z2 bandı 0.98", () => {
    expect(pgaCarpani(0.32)).toBe(0.98);
  });
  it("Z3 bandı nötr (1.00)", () => {
    expect(pgaCarpani(0.22)).toBe(1.00);
  });
  it("Z4 bandı premium", () => {
    expect(pgaCarpani(0.15)).toBe(1.02);
  });
  it("Z5 en yüksek premium", () => {
    expect(pgaCarpani(0.05)).toBe(1.03);
  });
  it("null/undefined için nötr", () => {
    expect(pgaCarpani(null)).toBe(1.0);
    expect(pgaCarpani(undefined)).toBe(1.0);
    expect(pgaCarpani(NaN)).toBe(1.0);
  });
});

describe("depremRiskKoordGetir fallback zinciri", () => {
  beforeEach(() => {
    // Dexie node env'da yok — get/put hata fırlatacak, fonksiyon graceful handle etmeli
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("network"))));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("AFAD erişilemezse il-tablo fallback'e düşer", async () => {
    // İstanbul (yaklaşık koordinat) — il-tablo Z1 / pga ≥ 0.42
    const sonuc = await depremRiskKoordGetir(41.01, 28.97, "İstanbul");
    expect(sonuc).not.toBeNull();
    expect(sonuc?.kaynak).toBe("il-tablo");
    expect(sonuc?.zon).toBe("Z1");
    expect(sonuc?.pga).toBeGreaterThanOrEqual(0.40);
  });

  it("ne AFAD ne il bilinmiyorsa null", async () => {
    const sonuc = await depremRiskKoordGetir(0, 0, null);
    expect(sonuc).toBeNull();
  });

  // NOT (S1.4): AFAD TDTH fetch'ı kaldırıldı — il-tablo varsayılan.
  // Eski "AFAD başarılı dönerse" testi artık geçerli değil, bu eklendi:
  it("il bilinen kayıt için stabil il-tablo değeri döner", async () => {
    const sonuc1 = await depremRiskKoordGetir(41.01, 28.97, "İstanbul");
    const sonuc2 = await depremRiskKoordGetir(41.01, 28.97, "İstanbul");
    expect(sonuc1?.kaynak).toBe("il-tablo");
    expect(sonuc1?.pga).toBe(sonuc2?.pga);
    expect(sonuc1?.zon).toBe("Z1");
  });
});
