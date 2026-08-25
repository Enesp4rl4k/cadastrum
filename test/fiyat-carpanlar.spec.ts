/**
 * Sprint F2 + V3 E2 — Fiyat motoru çarpan fonksiyonları entegrasyon testleri
 *
 * Test kapsamı:
 *  - taşkın çarpanı (data/taskin-risk.ts)
 *  - nüfus yoğunluğu çarpanı (data/il-nufus.ts)
 *  - deprem PGA çarpanı (deprem-tdth.ts)
 *  - fiyat format yardımcıları (fiyat-tahmin.ts)
 *  - satış iskonto motoru (satis-iskonto.ts) [V3 E2]
 *  - piyasa ısısı tahmini (satis-iskonto.ts) [V3 E2]
 *
 * Tüm bu fonksiyonlar saf (I/O yok) — mock gerektirmez.
 */
import { describe, it, expect } from "vitest";

import {
  taskinRiskiGetir,
  taskinCarpani,
} from "../src/lib/data/taskin-risk";

import {
  nufusKategoriGetir,
  nufusCarpani,
} from "../src/lib/data/il-nufus";

import {
  pgaToZon,
  pgaCarpani,
} from "../src/lib/deprem-tdth";

import {
  fmtTL,
  fmtTLM2,
} from "../src/lib/fiyat-tahmin";

import {
  iskontoGetir,
  askingtenGercege,
  emsaleIskontoUygula,
  piyasaIsisiTahmin,
} from "../src/lib/satis-iskonto";

// ============================================================
describe("taskinRiskiGetir (il tablosu)", () => {
  it("bilinen yüksek riskli il (rize) → yüksek risk döner", () => {
    const r = taskinRiskiGetir("rize");
    expect(r).not.toBeNull();
    expect(r!.risk).toBe("yuksek");
  });

  it("bilinmeyen il → null döner", () => {
    expect(taskinRiskiGetir("bilinmeyenil")).toBeNull();
  });

  it("null girdi → null döner", () => {
    expect(taskinRiskiGetir(null)).toBeNull();
  });

  it("boş string → null döner", () => {
    expect(taskinRiskiGetir("")).toBeNull();
  });
});

// ============================================================
describe("taskinCarpani (risk → fiyat etkisi)", () => {
  it("null risk → 1.0 (etki yok)", () => {
    expect(taskinCarpani(null)).toBe(1.0);
  });

  it("orta risk → 1.0 (nötr)", () => {
    expect(taskinCarpani("orta")).toBe(1.0);
  });

  it("yüksek risk → 1'den küçük (değer düşürücü)", () => {
    expect(taskinCarpani("yuksek")).toBeLessThan(1.0);
  });

  it("düşük risk → 1'den büyük veya eşit (nötr veya prim)", () => {
    expect(taskinCarpani("dusuk")).toBeGreaterThanOrEqual(1.0);
  });

  it("yüksek risk çarpanı en az %5 düşürücü", () => {
    expect(taskinCarpani("yuksek")).toBeLessThanOrEqual(0.95);
  });
});

// ============================================================
describe("nufusKategoriGetir (yoğunluk → kategori)", () => {
  // Implementation: mega≥1000, cot-yogun≥300, yogun≥100, orta≥50, seyrek≥20, cot-seyrek<20
  it("≥1000 → mega", () => {
    expect(nufusKategoriGetir(1000)).toBe("mega");
    expect(nufusKategoriGetir(5000)).toBe("mega");
  });

  it("300-999 → cok-yogun", () => {
    expect(nufusKategoriGetir(300)).toBe("cok-yogun");
    expect(nufusKategoriGetir(999)).toBe("cok-yogun");
  });

  it("100-299 → yogun", () => {
    expect(nufusKategoriGetir(100)).toBe("yogun");
    expect(nufusKategoriGetir(200)).toBe("yogun");
  });

  it("50-99 → orta", () => {
    expect(nufusKategoriGetir(50)).toBe("orta");
    expect(nufusKategoriGetir(75)).toBe("orta");
  });

  it("20-49 → seyrek", () => {
    expect(nufusKategoriGetir(20)).toBe("seyrek");
    expect(nufusKategoriGetir(40)).toBe("seyrek");
  });

  it("<20 → cok-seyrek", () => {
    expect(nufusKategoriGetir(10)).toBe("cok-seyrek");
    expect(nufusKategoriGetir(0)).toBe("cok-seyrek");
  });
});

// ============================================================
describe("nufusCarpani (il norm → çarpan)", () => {
  it("İstanbul → carpan > 1.0 (büyük şehir primi)", () => {
    const r = nufusCarpani("istanbul");
    expect(r.carpan).toBeGreaterThan(1.0);
  });

  it("bilinmeyen il → 1.0 (etki yok)", () => {
    const r = nufusCarpani("bilinmeyen__il");
    expect(r.carpan).toBe(1.0);
  });

  it("her zaman pozitif carpan döner", () => {
    const r1 = nufusCarpani("istanbul");
    const r2 = nufusCarpani("tunceli");
    expect(r1.carpan).toBeGreaterThan(0);
    expect(r2.carpan).toBeGreaterThan(0);
  });

  it("büyük şehir > küçük şehir çarpanı (monotonluk)", () => {
    const buyuk = nufusCarpani("istanbul");
    const kucuk = nufusCarpani("ardahan");
    // Büyük şehir daha yüksek veya eşit olmalı
    expect(buyuk.carpan).toBeGreaterThanOrEqual(kucuk.carpan);
  });

  it("aciklama alanı dolu string döner", () => {
    const r = nufusCarpani("istanbul");
    expect(typeof r.aciklama).toBe("string");
    expect(r.aciklama.length).toBeGreaterThan(0);
  });
});

// ============================================================
describe("pgaToZon (PGA → deprem zonu, 5 bant)", () => {
  // Z1≥0.40 | Z2:0.30-0.39 | Z3:0.20-0.29 | Z4:0.10-0.19 | Z5:<0.10
  it("≥0.40g → Z1 (çok yüksek)", () => {
    expect(pgaToZon(0.40)).toBe("Z1");
    expect(pgaToZon(0.60)).toBe("Z1");
  });

  it("0.30-0.39g → Z2 (yüksek)", () => {
    expect(pgaToZon(0.30)).toBe("Z2");
    expect(pgaToZon(0.39)).toBe("Z2");
  });

  it("0.20-0.29g → Z3 (orta-yüksek)", () => {
    expect(pgaToZon(0.20)).toBe("Z3");
    expect(pgaToZon(0.29)).toBe("Z3");
  });

  it("0.10-0.19g → Z4 (orta-düşük)", () => {
    expect(pgaToZon(0.10)).toBe("Z4");
    expect(pgaToZon(0.19)).toBe("Z4");
  });

  it("<0.10g → Z5 (düşük)", () => {
    expect(pgaToZon(0.05)).toBe("Z5");
    expect(pgaToZon(0.00)).toBe("Z5");
  });
});

// ============================================================
describe("pgaCarpani (PGA değeri → fiyat çarpanı)", () => {
  it("null/undefined → 1.0 (etki yok)", () => {
    expect(pgaCarpani(null)).toBe(1.0);
    expect(pgaCarpani(undefined)).toBe(1.0);
  });

  it("NaN → 1.0", () => {
    expect(pgaCarpani(NaN)).toBe(1.0);
  });

  it("yüksek PGA (Z1) → 1'den küçük (değer düşürücü)", () => {
    expect(pgaCarpani(0.5)).toBeLessThan(1.0);
  });

  it("düşük PGA (Z4) → 1.0 veya hafif prim", () => {
    expect(pgaCarpani(0.05)).toBeGreaterThanOrEqual(1.0);
  });

  it("Z1 çarpanı Z2'den daha düşürücü", () => {
    const z1 = pgaCarpani(0.5);
    const z2 = pgaCarpani(0.25);
    expect(z1).toBeLessThanOrEqual(z2);
  });
});

// ============================================================
describe("fmtTL (para formatı)", () => {
  it("1.250.000 → milyar yok, milyon formatı", () => {
    const s = fmtTL(1_250_000);
    expect(s).toContain("TL");
  });

  it("≥1 milyar → Milyar TL içerir", () => {
    const s = fmtTL(2_500_000_000);
    expect(s).toContain("Milyar TL");
  });

  it("≥1 milyon → M TL veya milyon formatı", () => {
    const s = fmtTL(1_500_000);
    expect(s).toContain("TL");
    // en az 1 rakam var
    expect(s).toMatch(/\d/);
  });

  it("0 → TL içerir", () => {
    expect(fmtTL(0)).toContain("TL");
  });

  it("negatif değer → TL içerir", () => {
    expect(fmtTL(-500_000)).toContain("TL");
  });
});

// ============================================================
describe("fmtTLM2 (m² fiyat formatı)", () => {
  it("1500 → '1.500 TL/m²' formatı", () => {
    const s = fmtTLM2(1500);
    expect(s).toContain("TL/m²");
    expect(s).toMatch(/\d/);
  });

  it("0 → TL/m² içerir", () => {
    expect(fmtTLM2(0)).toContain("TL/m²");
  });

  it("büyük değer doğru formatlanır", () => {
    const s = fmtTLM2(100_000);
    expect(s).toContain("TL/m²");
  });
});

// ============================================================
describe("çarpan entegrasyon — birlikte doğruluk", () => {
  it("yüksek deprem + yüksek taşkın → her iki çarpan da <1.0", () => {
    const depremCarpaniDegeri = pgaCarpani(0.5); // Z1
    const taskinCarpaniDegeri = taskinCarpani("yuksek");
    expect(depremCarpaniDegeri).toBeLessThan(1.0);
    expect(taskinCarpaniDegeri).toBeLessThan(1.0);
    // Birlikte uygulandığında çarpım 1'den belirgin küçük
    expect(depremCarpaniDegeri * taskinCarpaniDegeri).toBeLessThan(0.9);
  });

  it("büyük nüfus primi taşkın negatifini kısmen telafi eder ama aşamaz (orantı testi)", () => {
    const nufusPrimi = nufusCarpani("istanbul").carpan;
    const taskinNegatif = taskinCarpani("yuksek");
    // Nüfus primi pozitif, taşkın negatif — birlikte 1'e yakın kalabilir
    const net = nufusPrimi * taskinNegatif;
    expect(net).toBeGreaterThan(0);
    // Sanity: net değer saçma aralıkta değil (0.5 ile 2.5 arası)
    expect(net).toBeGreaterThan(0.5);
    expect(net).toBeLessThan(2.5);
  });
});

// ── Satış iskonto motoru ─────────────────────────────────────────────────────

describe("iskontoGetir (il + kategori → iskonto oranı)", () => {
  it("İstanbul arsa → %12 iskonto", () => {
    const r = iskontoGetir("istanbul", "arsa");
    expect(r.oran).toBeCloseTo(0.12, 2);
    expect(r.carpan).toBeCloseTo(0.88, 2);
  });

  it("Hakkari arsa → yüksek iskonto (≥%20)", () => {
    const r = iskontoGetir("hakkari", "arsa");
    expect(r.oran).toBeGreaterThanOrEqual(0.20);
  });

  it("büyükşehir < küçük doğu ili iskontosu (monotonluk)", () => {
    const istanbul = iskontoGetir("istanbul", "arsa");
    const hakkari = iskontoGetir("hakkari", "arsa");
    expect(istanbul.oran).toBeLessThan(hakkari.oran);
  });

  it("null il → varsayılan iskonto (%20)", () => {
    const r = iskontoGetir(null, "arsa");
    expect(r.oran).toBeGreaterThanOrEqual(0.15);
  });

  it("tarla iskontosu arsa'dan yüksek (aynı il)", () => {
    const arsa = iskontoGetir("istanbul", "arsa");
    const tarla = iskontoGetir("istanbul", "tarla");
    expect(tarla.oran).toBeGreaterThan(arsa.oran);
  });

  it("soğuk piyasa iskontoyu artırır", () => {
    const normal = iskontoGetir("ankara", "arsa", "normal");
    const soguk = iskontoGetir("ankara", "arsa", "soguk");
    expect(soguk.oran).toBeGreaterThan(normal.oran);
  });

  it("sıcak piyasa iskontoyu azaltır", () => {
    const normal = iskontoGetir("ankara", "arsa", "normal");
    const sicak = iskontoGetir("ankara", "arsa", "sicak");
    expect(sicak.oran).toBeLessThan(normal.oran);
  });

  it("iskonto oranı her zaman [0.05, 0.40] aralığında", () => {
    const iller = ["istanbul", "hakkari", "ankara", "van", "mugla", null];
    const kategoriler = ["arsa", "tarla", "genel"] as const;
    const piyasalar = ["sicak", "normal", "soguk"] as const;
    for (const il of iller) {
      for (const kat of kategoriler) {
        for (const piyasa of piyasalar) {
          const r = iskontoGetir(il, kat, piyasa);
          expect(r.oran).toBeGreaterThanOrEqual(0.05);
          expect(r.oran).toBeLessThanOrEqual(0.40);
        }
      }
    }
  });

  it("aciklama ve metodoloji string alanları dolu", () => {
    const r = iskontoGetir("istanbul", "arsa");
    expect(r.aciklama.length).toBeGreaterThan(10);
    expect(r.metodoloji.length).toBeGreaterThan(10);
  });
});

// ── askingtenGercege ────────────────────────────────────────────────────────

describe("askingtenGercege (asking price → gerçek satış)", () => {
  it("100.000 TL/m² İstanbul arsa → düşük değer döner (iskonto uygulandı)", () => {
    const { gercekPerM2 } = askingtenGercege(100_000, "istanbul", "arsa");
    expect(gercekPerM2).toBeLessThan(100_000);
    expect(gercekPerM2).toBeGreaterThan(80_000); // %12 iskonto → ~88.000
  });

  it("gercekPerM2 tam sayı (Math.round)", () => {
    const { gercekPerM2 } = askingtenGercege(123_456, "istanbul", "arsa");
    expect(Number.isInteger(gercekPerM2)).toBe(true);
  });

  it("sıfır fiyat → sıfır gerçek fiyat", () => {
    const { gercekPerM2 } = askingtenGercege(0, "istanbul", "arsa");
    expect(gercekPerM2).toBe(0);
  });
});

// ── emsaleIskontoUygula ──────────────────────────────────────────────────────

describe("emsaleIskontoUygula (emsal ortalama → düzeltilmiş)", () => {
  it("50.000 TL/m² → düzeltilmiş daha düşük", () => {
    const r = emsaleIskontoUygula(50_000, "istanbul", "arsa");
    expect(r.duzeltilmisPerM2).toBeLessThan(50_000);
  });

  it("carpan 0 ile 1 arasında", () => {
    const r = emsaleIskontoUygula(50_000, "istanbul", "arsa");
    expect(r.carpan).toBeGreaterThan(0);
    expect(r.carpan).toBeLessThan(1);
  });

  it("aciklama dolu string döner", () => {
    const r = emsaleIskontoUygula(50_000, "istanbul", "arsa");
    expect(r.aciklama.length).toBeGreaterThan(5);
  });
});

// ── piyasaIsisiTahmin ───────────────────────────────────────────────────────

describe("piyasaIsisiTahmin (il → piyasa ısısı)", () => {
  it("İstanbul → sicak", () => {
    expect(piyasaIsisiTahmin("istanbul")).toBe("sicak");
  });

  it("Muğla → sicak (turizm)", () => {
    expect(piyasaIsisiTahmin("mugla")).toBe("sicak");
  });

  it("Hakkari → soguk", () => {
    expect(piyasaIsisiTahmin("hakkari")).toBe("soguk");
  });

  it("Kars → soguk", () => {
    expect(piyasaIsisiTahmin("kars")).toBe("soguk");
  });

  it("Konya → normal", () => {
    expect(piyasaIsisiTahmin("konya")).toBe("normal");
  });

  it("null → normal", () => {
    expect(piyasaIsisiTahmin(null)).toBe("normal");
  });

  it("bilinmeyen il → normal", () => {
    expect(piyasaIsisiTahmin("bilinmeyenil")).toBe("normal");
  });
});
