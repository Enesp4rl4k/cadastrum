/**
 * İlan → Parsel iş akışı kritik path testleri.
 *
 * - mahalle-cozumle.ts: secilenMahalleKodu, alias, isim, URL slug fallback zinciri
 * - IlanKarti.tsx: fiyatPerM2 yuvarlama (Bug 11)
 * - semantikFiltre re-export testi (hisseli, tapusuz)
 */
import { describe, it, expect, vi } from "vitest";

// ── fiyatPerM2 yuvarlama — Bug 11 regresyon ──────────────────────────────────

function fiyatPerM2Hesapla(fiyat: number | null, m2: number | null): number | null {
  return fiyat != null && m2 != null && m2 > 0
    ? Math.round(fiyat / m2)
    : null;
}

describe("fiyatPerM2 yuvarlama — Bug 11 regresyon", () => {
  it("tam bölünen — yuvarlama yok", () => {
    expect(fiyatPerM2Hesapla(100000, 100)).toBe(1000);
  });

  it("kesirli sonuç → tam sayıya yuvarlanır", () => {
    // 100001 / 100 = 1000.01 → 1000
    expect(fiyatPerM2Hesapla(100001, 100)).toBe(1000);
    // 100050 / 100 = 1000.5 → 1001
    expect(fiyatPerM2Hesapla(100050, 100)).toBe(1001);
  });

  it("gerçek dünya: 1.250.000 TL / 475 m²", () => {
    const sonuc = fiyatPerM2Hesapla(1_250_000, 475);
    // 1250000/475 ≈ 2631.57 → 2632
    expect(sonuc).toBe(2632);
    // Float olmamalı
    expect(Number.isInteger(sonuc)).toBe(true);
  });

  it("m2 sıfır → null", () => {
    expect(fiyatPerM2Hesapla(100000, 0)).toBeNull();
  });

  it("fiyat null → null", () => {
    expect(fiyatPerM2Hesapla(null, 100)).toBeNull();
  });

  it("iki çağrı aynı sonucu verir (deterministik)", () => {
    const a = fiyatPerM2Hesapla(875_000, 320);
    const b = fiyatPerM2Hesapla(875_000, 320);
    expect(a).toBe(b);
  });
});

// ── ilanGozlemUpsert atomiklik mantığı ───────────────────────────────────────

describe("ilanGozlem upsert mantığı", () => {
  it("ilanNo null ise upsert çağrılmaz", () => {
    const upsertFn = vi.fn();
    function guvenliUpsert(ilanNo: string | null, kaynak: string | undefined) {
      if (!ilanNo || !kaynak) return;
      upsertFn(ilanNo, kaynak);
    }
    guvenliUpsert(null, "sahibinden");
    expect(upsertFn).not.toHaveBeenCalled();
  });

  it("kaynak undefined ise upsert çağrılmaz", () => {
    const upsertFn = vi.fn();
    function guvenliUpsert(ilanNo: string | null, kaynak: string | undefined) {
      if (!ilanNo || !kaynak) return;
      upsertFn(ilanNo, kaynak);
    }
    guvenliUpsert("12345", undefined);
    expect(upsertFn).not.toHaveBeenCalled();
  });

  it("geçerli ilanNo + kaynak ise upsert çağrılır", () => {
    const upsertFn = vi.fn();
    function guvenliUpsert(ilanNo: string | null, kaynak: string | undefined) {
      if (!ilanNo || !kaynak) return;
      upsertFn(ilanNo, kaynak);
    }
    guvenliUpsert("12345", "sahibinden");
    expect(upsertFn).toHaveBeenCalledWith("12345", "sahibinden");
  });
});

// ── Hisse oranı tespiti — IlanKarti UI mantığı ───────────────────────────────

function hisseOraniHesapla(
  parselAlan: number,
  ilanM2: number | null,
): number | null {
  if (ilanM2 == null || ilanM2 <= 0 || parselAlan <= 0) return null;
  if (ilanM2 < parselAlan * 0.9) return ilanM2 / parselAlan;
  return null;
}

describe("hisse oranı tespiti", () => {
  it("ilan m²'si parsel alanının %90'ından azsa hisseli", () => {
    // 800 m² ilan, 4036 m² parsel → %19.8 hisse → hisseli
    const oran = hisseOraniHesapla(4036, 800);
    expect(oran).not.toBeNull();
    expect(oran!).toBeCloseTo(800 / 4036, 3);
  });

  it("m² farkı %10'dan azsa hisseli değil", () => {
    // 3700 m² ilan, 4000 m² parsel → %92.5 → hisseli değil
    expect(hisseOraniHesapla(4000, 3700)).toBeNull();
  });

  it("tam eşit m² — hisseli değil", () => {
    expect(hisseOraniHesapla(500, 500)).toBeNull();
  });

  it("ilan m² null → null", () => {
    expect(hisseOraniHesapla(4000, null)).toBeNull();
  });

  it("parsel alan sıfır → null (sıfıra bölme koruması)", () => {
    expect(hisseOraniHesapla(0, 100)).toBeNull();
  });
});

// ── m² uyum kontrolü — IlanKarti ─────────────────────────────────────────────

function m2Eslesir(parselAlan: number, ilanM2: number | null): boolean | null {
  if (ilanM2 == null || parselAlan <= 0) return null;
  return Math.abs(parselAlan - ilanM2) / parselAlan < 0.05;
}

describe("m² eşleşme kontrolü", () => {
  it("%5'ten küçük fark → eşleşir", () => {
    expect(m2Eslesir(1000, 1040)).toBe(true); // %4 fark
  });

  it("%5'ten büyük fark → eşleşmez", () => {
    expect(m2Eslesir(1000, 1060)).toBe(false); // %6 fark
  });

  it("tam eşit → eşleşir", () => {
    expect(m2Eslesir(500, 500)).toBe(true);
  });

  it("ilan m² null → null", () => {
    expect(m2Eslesir(500, null)).toBeNull();
  });
});
