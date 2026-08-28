/**
 * carpan-zinciri.ts unit testleri
 *
 * Saf fonksiyonlar (I/O yok, mock gerekmez):
 *   - alanBandi
 *   - segmentBul
 *   - nitelikCarpani
 *   - alanCarpani
 *   - carpanZinciriUygula (CARPAN_CAP garantisi)
 *   - alanBandUyumu / segmentUyumu / imarUyumu / alanBenzerlikSkoru
 */
import { describe, it, expect } from "vitest";
import {
  alanBandi,
  segmentBul,
  nitelikCarpani,
  alanCarpani,
  carpanZinciriUygula,
  alanBandUyumu,
  segmentUyumu,
  imarUyumu,
  alanBenzerlikSkoru,
  tarımsalMi,
  CARPAN_CAP_MIN,
  CARPAN_CAP_MAX,
} from "../src/lib/carpan-zinciri";

// ── alanBandi ────────────────────────────────────────────────────────────────

describe("alanBandi", () => {
  it("<250 → micro", () => {
    expect(alanBandi(100)).toBe("micro");
    expect(alanBandi(249)).toBe("micro");
  });
  it("250-999 → kucuk", () => {
    expect(alanBandi(250)).toBe("kucuk");
    expect(alanBandi(999)).toBe("kucuk");
  });
  it("1000-4999 → orta", () => {
    expect(alanBandi(1000)).toBe("orta");
    expect(alanBandi(4999)).toBe("orta");
  });
  it("5000-19999 → buyuk", () => {
    expect(alanBandi(5000)).toBe("buyuk");
    expect(alanBandi(19999)).toBe("buyuk");
  });
  it("≥20000 → cok-buyuk", () => {
    expect(alanBandi(20000)).toBe("cok-buyuk");
    expect(alanBandi(100000)).toBe("cok-buyuk");
  });
});

// ── segmentBul ───────────────────────────────────────────────────────────────

describe("segmentBul", () => {
  it("arsa → arsa", () => {
    expect(segmentBul("Arsa")).toBe("arsa");
    expect(segmentBul("Hisseli Arsa")).toBe("arsa");
  });
  it("tarla → tarla", () => {
    expect(segmentBul("Tarla")).toBe("tarla");
  });
  it("bahçe → bahce", () => {
    expect(segmentBul("Bahçe")).toBe("bahce");
    expect(segmentBul("Bahce")).toBe("bahce");
  });
  it("mesken → built", () => {
    expect(segmentBul("Mesken")).toBe("built");
    expect(segmentBul("Bina")).toBe("built");
  });
  it("yol → road", () => {
    expect(segmentBul("Yol")).toBe("road");
  });
  it("null/undefined → other", () => {
    expect(segmentBul(null)).toBe("other");
    expect(segmentBul(undefined)).toBe("other");
    expect(segmentBul("")).toBe("other");
  });
});

// ── nitelikCarpani ───────────────────────────────────────────────────────────

describe("nitelikCarpani", () => {
  it("Arsa → 1.0 (baseline)", () => {
    const r = nitelikCarpani("Arsa");
    expect(r.carpan).toBe(1.0);
  });
  it("Mesken → 2.5 (yapı primi)", () => {
    const r = nitelikCarpani("Mesken");
    expect(r.carpan).toBe(2.5);
  });
  it("Tarla → 0.25 (tarımsal düşüş)", () => {
    const r = nitelikCarpani("Tarla");
    expect(r.carpan).toBe(0.25);
  });
  it("Yol → 0 (kamu yolu)", () => {
    const r = nitelikCarpani("Yol parsel");
    expect(r.carpan).toBe(0);
  });
  it("Zeytinlik → 0.40 (kanun kısıtlaması)", () => {
    const r = nitelikCarpani("Zeytinlik");
    expect(r.carpan).toBe(0.4);
  });
  it("Bilinmeyen → 0.5 fallback", () => {
    const r = nitelikCarpani("BilinmeyenNitelik");
    expect(r.carpan).toBe(0.5);
  });
  it("her zaman not alanı dolu string döner", () => {
    expect(nitelikCarpani("Tarla").not.length).toBeGreaterThan(0);
    expect(nitelikCarpani("Arsa").not.length).toBeGreaterThan(0);
  });
});

// ── alanCarpani ──────────────────────────────────────────────────────────────

describe("alanCarpani", () => {
  // Değerler emlakjet veri setinden AYNI MAHALLE içi karşılaştırmayla türetildi
  // (bkz. carpan-zinciri.ts alanCarpani doc). Arsa referans bandı 750-2.5k.
  it("<200 → 1.47 (mikro prim)", () => {
    expect(alanCarpani(100).carpan).toBe(1.47);
    expect(alanCarpani(199).carpan).toBe(1.47);
  });
  it("200-749 → 1.27", () => {
    expect(alanCarpani(200).carpan).toBe(1.27);
    expect(alanCarpani(749).carpan).toBe(1.27);
  });
  it("750-2499 → 1.0 (referans)", () => {
    expect(alanCarpani(750).carpan).toBe(1.0);
    expect(alanCarpani(2499).carpan).toBe(1.0);
  });
  it("2500-9999 → 0.67", () => {
    expect(alanCarpani(2500).carpan).toBe(0.67);
    expect(alanCarpani(9999).carpan).toBe(0.67);
  });
  it("10000-49999 → 0.38, ≥50000 → 0.32", () => {
    expect(alanCarpani(10000).carpan).toBe(0.38);
    expect(alanCarpani(49999).carpan).toBe(0.38);
    expect(alanCarpani(50000).carpan).toBe(0.32);
  });
  it("tarla ölçeği ayrı — tipik tarla büyüklüğü referans, arsa gibi iskonto yemez", () => {
    // Aynı 3.672 m² (tarla medyanı) arsa ölçeğinde 0.67x iskonto yerken
    // tarla ölçeğinde referansa yakın kalır — baseline zaten büyük-parsel fiyatı.
    expect(alanCarpani(3672, "arsa").carpan).toBe(0.67);
    expect(alanCarpani(3672, "tarla").carpan).toBeGreaterThan(0.9);
  });
  it("monoton azalır — küçük arsa > büyük arsa m² fiyatı", () => {
    expect(alanCarpani(100).carpan).toBeGreaterThan(alanCarpani(1000).carpan);
    expect(alanCarpani(1000).carpan).toBeGreaterThan(alanCarpani(50000).carpan);
  });
});

// ── carpanZinciriUygula — CAP garantisi ──────────────────────────────────────

describe("carpanZinciriUygula — CARPAN_CAP garantisi", () => {
  it("tek nötr çarpan (1.0) → cap yok, toplam 1.0", () => {
    const r = carpanZinciriUygula([{ ad: "test", carpan: 1.0, not: "" }]);
    expect(r.toplamCarpan).toBe(1.0);
    expect(r.capUygulandiMi).toBe(false);
  });

  it("aşırı yüksek çarpanlar → CAP_MAX'a kırpılır", () => {
    // 2.0 × 2.0 × 2.0 = 8.0 → 1.60'a kırpılmalı
    const r = carpanZinciriUygula([
      { ad: "a", carpan: 2.0, not: "" },
      { ad: "b", carpan: 2.0, not: "" },
      { ad: "c", carpan: 2.0, not: "" },
    ]);
    expect(r.toplamCarpan).toBe(CARPAN_CAP_MAX);
    expect(r.capUygulandiMi).toBe(true);
    expect(r.hamCarpan).toBeCloseTo(8.0, 4);
  });

  it("aşırı düşük çarpanlar → CAP_MIN'e kırpılır", () => {
    // 0.1 × 0.1 × 0.1 = 0.001 → 0.40'a kırpılmalı
    const r = carpanZinciriUygula([
      { ad: "a", carpan: 0.1, not: "" },
      { ad: "b", carpan: 0.1, not: "" },
      { ad: "c", carpan: 0.1, not: "" },
    ]);
    expect(r.toplamCarpan).toBe(CARPAN_CAP_MIN);
    expect(r.capUygulandiMi).toBe(true);
  });

  it("normal kombinasyon → cap uygulanmaz", () => {
    const r = carpanZinciriUygula([
      { ad: "alan", carpan: 1.5, not: "" },
      { ad: "egim", carpan: 0.9, not: "" },
    ]);
    expect(r.capUygulandiMi).toBe(false);
    expect(r.toplamCarpan).toBeCloseTo(1.35, 4);
    expect(r.hamCarpan).toBeCloseTo(1.35, 4);
  });

  it("toplamCarpan her zaman [CAP_MIN, CAP_MAX] aralığında", () => {
    const testler = [
      [{ ad: "a", carpan: 0.001, not: "" }],
      [{ ad: "a", carpan: 100, not: "" }],
      [{ ad: "a", carpan: 1.2, not: "" }, { ad: "b", carpan: 1.3, not: "" }],
    ];
    for (const bilesenler of testler) {
      const r = carpanZinciriUygula(bilesenler);
      expect(r.toplamCarpan).toBeGreaterThanOrEqual(CARPAN_CAP_MIN);
      expect(r.toplamCarpan).toBeLessThanOrEqual(CARPAN_CAP_MAX);
    }
  });

  it("boş bileşen listesi → toplam 1.0", () => {
    const r = carpanZinciriUygula([]);
    expect(r.toplamCarpan).toBe(1.0);
    expect(r.capUygulandiMi).toBe(false);
  });
});

// ── alanBandUyumu ────────────────────────────────────────────────────────────

describe("alanBandUyumu", () => {
  it("aynı band → 1.0", () => {
    expect(alanBandUyumu(500, 600)).toBe(1);    // kucuk, kucuk
    expect(alanBandUyumu(2000, 1500)).toBe(1);  // orta, orta
  });
  it("1 band fark → 0.86", () => {
    expect(alanBandUyumu(500, 1500)).toBe(0.86); // kucuk → orta
  });
  it("2 band fark → 0.68", () => {
    expect(alanBandUyumu(150, 1500)).toBe(0.68); // micro → orta
  });
  it("3+ band fark → 0.45", () => {
    expect(alanBandUyumu(100, 25000)).toBe(0.45); // micro → cok-buyuk
  });
  it("null ilan m² → 0.70 fallback", () => {
    expect(alanBandUyumu(500, null)).toBe(0.7);
  });
});

// ── segmentUyumu ─────────────────────────────────────────────────────────────

describe("segmentUyumu", () => {
  it("aynı segment → 1.0", () => {
    expect(segmentUyumu("arsa", "arsa")).toBe(1);
    expect(segmentUyumu("tarla", "tarla")).toBe(1);
  });
  it("road dahil → 0", () => {
    expect(segmentUyumu("road", "arsa")).toBe(0);
    expect(segmentUyumu("arsa", "road")).toBe(0);
  });
  it("tarımsal × tarımsal → 0.80", () => {
    expect(segmentUyumu("tarla", "bahce")).toBe(0.80);
    expect(segmentUyumu("bag", "zeytinlik")).toBe(0.80);
  });
  it("kentsel × kentsel farklı → 0.75", () => {
    expect(segmentUyumu("arsa", "built")).toBe(0.75);
  });
  it("kentsel × tarımsal → 0.40 (düşük uyum)", () => {
    expect(segmentUyumu("arsa", "tarla")).toBe(0.40);
    expect(segmentUyumu("built", "bahce")).toBe(0.40);
  });
});

// ── imarUyumu ────────────────────────────────────────────────────────────────

describe("imarUyumu", () => {
  it("aynı imar → 1.0", () => {
    expect(imarUyumu("konut-imarli", "konut-imarli")).toBe(1);
    expect(imarUyumu("tarimsal", "tarimsal")).toBe(1);
  });
  it("belirsiz imar dahil → 0.7", () => {
    expect(imarUyumu("belirsiz", "konut-imarli")).toBe(0.7);
    expect(imarUyumu("arsa-imar-belirsiz", "tarimsal")).toBe(0.7);
  });
  it("farklı belirli imar → 0.4", () => {
    expect(imarUyumu("konut-imarli", "tarimsal")).toBe(0.4);
    expect(imarUyumu("ticari-imarli", "sanayi-imarli")).toBe(0.4);
  });
});

// ── alanBenzerlikSkoru ────────────────────────────────────────────────────────

describe("alanBenzerlikSkoru", () => {
  it("aynı alan → 1.0", () => {
    expect(alanBenzerlikSkoru(1000, 1000)).toBe(1);
  });
  it("oran ≥0.70 → 1.0", () => {
    expect(alanBenzerlikSkoru(700, 1000)).toBe(1);  // 0.70
    expect(alanBenzerlikSkoru(1000, 700)).toBe(1);  // 0.70
  });
  it("oran 0.40-0.69 → 0.8", () => {
    expect(alanBenzerlikSkoru(400, 1000)).toBe(0.8); // 0.40
    expect(alanBenzerlikSkoru(600, 1000)).toBe(0.8); // 0.60
  });
  it("oran 0.20-0.39 → 0.6", () => {
    expect(alanBenzerlikSkoru(200, 1000)).toBe(0.6); // 0.20
  });
  it("oran <0.20 → 0.4", () => {
    expect(alanBenzerlikSkoru(100, 1000)).toBe(0.4); // 0.10
  });
  it("null/sıfır ilan m² → 0.45 fallback", () => {
    expect(alanBenzerlikSkoru(1000, null)).toBe(0.45);
    expect(alanBenzerlikSkoru(1000, 0)).toBe(0.45);
  });
});

// ── tarımsalMi ────────────────────────────────────────────────────────────────

describe("tarımsalMi", () => {
  it("tarla → true", () => expect(tarımsalMi("Tarla")).toBe(true));
  it("bahçe → true", () => expect(tarımsalMi("Bahçe")).toBe(true));
  it("zeytinlik → true", () => expect(tarımsalMi("Zeytinlik")).toBe(true));
  it("arsa → false", () => expect(tarımsalMi("Arsa")).toBe(false));
  it("mesken → false", () => expect(tarımsalMi("Mesken")).toBe(false));
});
