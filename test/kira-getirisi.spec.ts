/**
 * kira-getirisi.ts unit testleri
 *
 * kiraTahminiHesapla() saf bir fonksiyon (I/O yok, sadece statik tablo).
 * normalizeYerAdi bağımlılığı mock'lanıyor.
 */
import { describe, it, expect, vi } from "vitest";

// normalizeYerAdi mock'u — basit lowercase + türkçe normalize
vi.mock("../src/lib/tkgm-api", () => ({
  normalizeYerAdi: (s: string) =>
    s
      .toLocaleLowerCase("tr")
      .replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ı/g, "i")
      .replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u"),
}));

import { kiraTahminiHesapla } from "../src/lib/kira-getirisi";
import type { Parsel } from "../src/types/tkgm";

/** Minimal test parseli oluşturur */
function parselYap(overrides: Partial<Parsel>): Parsel {
  return {
    il: 34,
    ilAd: "İstanbul",
    ilce: 1,
    ilceAd: "Kadıköy",
    ilceKodu: 34001,
    mahalleKodu: 340010001,
    mahalleAd: "Moda",
    adaNo: "100",
    parselNo: "1",
    koordinatlar: [],
    alan: 100,
    nitelik: "Mesken",
    merkezNokta: { lat: 40.98, lng: 29.03 },
    geometri: null,
    ...overrides,
  } as unknown as Parsel;
}

// ── Sıfır / geçersiz alan ──────────────────────────────────────────────────

describe("kiraTahminiHesapla — geçersiz girdi", () => {
  it("alan 0 → null", () => {
    expect(kiraTahminiHesapla(parselYap({ alan: 0 }))).toBeNull();
  });

  it("alan negatif → null", () => {
    expect(kiraTahminiHesapla(parselYap({ alan: -50 }))).toBeNull();
  });
});

// ── Konut niteliği ────────────────────────────────────────────────────────

describe("kiraTahminiHesapla — konut niteliği", () => {
  it("mesken niteliği → kira tahmini döner", () => {
    const r = kiraTahminiHesapla(parselYap({ nitelik: "Mesken", alan: 100 }));
    expect(r).not.toBeNull();
    expect(r!.aylikKira).toBeGreaterThan(0);
    expect(r!.yillikKira).toBe(r!.aylikKira * 12);
  });

  it("bina niteliği → kira tahmini döner", () => {
    const r = kiraTahminiHesapla(parselYap({ nitelik: "Bina", alan: 80 }));
    expect(r).not.toBeNull();
    expect(r!.kaynak).toBe("statik-il");
  });

  it("daire niteliği → kira tahmini döner", () => {
    const r = kiraTahminiHesapla(parselYap({ nitelik: "Daire", alan: 75 }));
    expect(r).not.toBeNull();
    expect(r!.guven).toBe("orta");
  });

  it("İstanbul için birim kira > Türkiye ortalaması", () => {
    const istanbul = kiraTahminiHesapla(parselYap({ ilAd: "İstanbul", nitelik: "Mesken", alan: 100 }));
    const bilinmeyen = kiraTahminiHesapla(parselYap({ ilAd: "BilinmeyenIl", nitelik: "Mesken", alan: 100 }));
    expect(istanbul).not.toBeNull();
    expect(bilinmeyen).not.toBeNull();
    expect(istanbul!.birimKira).toBeGreaterThan(bilinmeyen!.birimKira);
  });

  it("alan ile aylik kira doğrusal orantılı", () => {
    const r50  = kiraTahminiHesapla(parselYap({ nitelik: "Mesken", alan: 50 }));
    const r100 = kiraTahminiHesapla(parselYap({ nitelik: "Mesken", alan: 100 }));
    expect(r50).not.toBeNull();
    expect(r100).not.toBeNull();
    expect(r100!.aylikKira).toBe(r50!.aylikKira * 2);
  });

  it("bilinmeyen il → fallback değeri kullanılır", () => {
    const r = kiraTahminiHesapla(parselYap({ ilAd: "XyzUnknownIl", nitelik: "Mesken", alan: 100 }));
    expect(r).not.toBeNull();
    // Fallback 200 TL/m²/ay × 100m² = 20000
    expect(r!.aylikKira).toBe(20000);
    expect(r!.birimKira).toBe(200);
  });
});

// ── Arsa / tarla niteliği ─────────────────────────────────────────────────

describe("kiraTahminiHesapla — arsa niteliği", () => {
  it("arsa → null (kira yok)", () => {
    expect(kiraTahminiHesapla(parselYap({ nitelik: "Arsa" }))).toBeNull();
  });

  it("hisseli arsa → null", () => {
    expect(kiraTahminiHesapla(parselYap({ nitelik: "Hisseli Arsa" }))).toBeNull();
  });
});

// ── Tarımsal nitelik ──────────────────────────────────────────────────────

describe("kiraTahminiHesapla — tarımsal nitelik", () => {
  it("tarla → tarımsal tahmini döner", () => {
    const r = kiraTahminiHesapla(parselYap({ nitelik: "Tarla", alan: 10000 }));
    expect(r).not.toBeNull();
    expect(r!.kaynak).toBe("tarimsal-tahmini");
    expect(r!.guven).toBe("dusuk");
    expect(r!.aylikKira).toBeGreaterThan(0);
  });

  it("bahçe → tarımsal tahmini döner", () => {
    const r = kiraTahminiHesapla(parselYap({ nitelik: "Bahçe", alan: 5000 }));
    expect(r).not.toBeNull();
    expect(r!.kaynak).toBe("tarimsal-tahmini");
  });

  it("zeytinlik → tarımsal tahmini döner", () => {
    const r = kiraTahminiHesapla(parselYap({ nitelik: "Zeytinlik", alan: 2000 }));
    expect(r).not.toBeNull();
    expect(r!.kaynak).toBe("tarimsal-tahmini");
  });

  it("tarımsal yillik = aylik × 12", () => {
    const r = kiraTahminiHesapla(parselYap({ nitelik: "Tarla", alan: 5000 }));
    expect(r).not.toBeNull();
    expect(r!.yillikKira).toBe(r!.aylikKira * 12);
  });

  it("Konya tarla → daha yüksek birim kira (verimli tarım ili)", () => {
    const konya  = kiraTahminiHesapla(parselYap({ ilAd: "Konya",  nitelik: "Tarla", alan: 10000 }));
    const van    = kiraTahminiHesapla(parselYap({ ilAd: "Van",    nitelik: "Tarla", alan: 10000 }));
    expect(konya).not.toBeNull();
    expect(van).not.toBeNull();
    expect(konya!.birimKira).toBeGreaterThanOrEqual(van!.birimKira);
  });
});
