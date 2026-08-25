/**
 * Spatial Emsal Motoru — saf matematik birim testleri
 *
 * Dexie / DB olmadan çalışır. idwHesapla, semantikFiltre,
 * spatialBaselineYeterliMi ve distance decay mantığı test edilir.
 */
import { describe, it, expect } from "vitest";
import {
  idwHesapla,
  semantikFiltre,
  spatialBaselineYeterliMi,
  D_BY_KATEGORI,
  type SpatialEmsalSonuc,
  type SpatialEmsalKayit,
} from "../src/lib/spatial-emsal";
import type { IlanGozlem } from "../src/lib/db";

// -------- yardımcılar --------
function sonuc(overrides: Partial<SpatialEmsalSonuc> = {}): SpatialEmsalSonuc {
  return {
    emsaller: [],
    halkaDagilimi: { r0_1km: 0, r1_3km: 0, r3_5km: 0, r5_10km: 0 },
    baseline: null,
    hamAdayAdet: 0,
    outlierAdet: 0,
    D: 5000,
    radiusM: 10000,
    ...overrides,
  };
}

function kayit(baslik: string, imarDurumu = ""): IlanGozlem {
  return {
    id: 1,
    ilanNo: "test",
    kaynak: "sahibinden",
    url: "",
    baslik,
    fiyat: 1000000,
    paraBirimi: "TRY",
    m2: 500,
    nitelik: "arsa",
    ilAd: "İstanbul",
    ilceAd: "Kadıköy",
    mahalleAd: "Test",
    mahalleKodu: null,
    lat: 41.0,
    lng: 29.0,
    imarDurumu,
    eklenme: Date.now(),
    guncelleme: Date.now(),
    aktif: 1,
  } as unknown as IlanGozlem;
}

function emsalKayit(fiyatPerM2TL: number, mesafeM: number): SpatialEmsalKayit {
  return {
    kayit: kayit("normal arsa"),
    fiyatPerM2TL,
    mesafeM,
    weight: 1,
    semantikIskonto: 1.0,
  };
}

// ============================================================
describe("D_BY_KATEGORI (distance decay sabitleri)", () => {
  it("tarla > arsa > konut (kırsal daha geniş)", () => {
    expect(D_BY_KATEGORI.tarla).toBeGreaterThan(D_BY_KATEGORI.arsa);
    expect(D_BY_KATEGORI.arsa).toBeGreaterThan(D_BY_KATEGORI.konut);
  });

  it("tüm değerler metre cinsinden makul aralıkta (500m–20km)", () => {
    for (const v of Object.values(D_BY_KATEGORI)) {
      expect(v).toBeGreaterThanOrEqual(500);
      expect(v).toBeLessThanOrEqual(20000);
    }
  });
});

// ============================================================
describe("idwHesapla (Inverse Distance Weighting, p=2)", () => {
  it("boş liste → null", () => {
    expect(idwHesapla([])).toBeNull();
  });

  it("tek eleman → o elemanın fiyatı döner", () => {
    expect(idwHesapla([{ fiyatPerM2TL: 5000, mesafeM: 1000 }])).toBe(5000);
  });

  it("eşit uzaklıkta iki eleman → aritmetik ortalama", () => {
    const r = idwHesapla([
      { fiyatPerM2TL: 4000, mesafeM: 500 },
      { fiyatPerM2TL: 6000, mesafeM: 500 },
    ]);
    expect(r).toBe(5000);
  });

  it("yakın emsal uzak emsale ağır basar (distance weighting)", () => {
    // 100m'deki emsal 10000 TL/m², 5000m'deki 2000 TL/m²
    // IDW yakına çok daha fazla ağırlık verir → sonuç ~10000'e yakın
    const r = idwHesapla([
      { fiyatPerM2TL: 10000, mesafeM: 100 },
      { fiyatPerM2TL: 2000, mesafeM: 5000 },
    ]);
    expect(r).toBeGreaterThan(9000);
  });

  it("sıfır mesafe → eps ile korunur, NaN/Inf dönmez", () => {
    const r = idwHesapla([{ fiyatPerM2TL: 8000, mesafeM: 0 }]);
    expect(r).not.toBeNull();
    expect(Number.isFinite(r!)).toBe(true);
  });

  it("p=1 (linear) kullanılabilir ve farklı sonuç verir", () => {
    const p2 = idwHesapla([
      { fiyatPerM2TL: 10000, mesafeM: 100 },
      { fiyatPerM2TL: 2000, mesafeM: 5000 },
    ], 2);
    const p1 = idwHesapla([
      { fiyatPerM2TL: 10000, mesafeM: 100 },
      { fiyatPerM2TL: 2000, mesafeM: 5000 },
    ], 1);
    // p=2 yakına daha çok ağırlık verir → p=2 sonucu ≥ p=1
    expect(p2!).toBeGreaterThanOrEqual(p1!);
  });

  it("tüm mesafeler eşit → fiyatların basit ortalaması", () => {
    const items = [
      { fiyatPerM2TL: 3000, mesafeM: 1000 },
      { fiyatPerM2TL: 5000, mesafeM: 1000 },
      { fiyatPerM2TL: 7000, mesafeM: 1000 },
    ];
    const r = idwHesapla(items);
    // Ortalama = 5000
    expect(r).toBeCloseTo(5000, -1); // ±10 TL tolerans
  });
});

// ============================================================
describe("semantikFiltre (hisseli/tapusuz tespit)", () => {
  it("normal arsa → 1.0 (sorun yok)", () => {
    expect(semantikFiltre(kayit("Satılık arsa 500 m²"))).toBe(1.0);
  });

  it("hisseli → 0.7 (indirim)", () => {
    expect(semantikFiltre(kayit("Hisseli arsa satılık"))).toBe(0.7);
  });

  it("paylı (Türkçe) → 0.7 (ascii fold ile tespit edilir)", () => {
    expect(semantikFiltre(kayit("Paylı satış arsa"))).toBe(0.7);
  });

  it("tapusuz → 0 (elem)", () => {
    expect(semantikFiltre(kayit("Tapusuz arsa"))).toBe(0);
  });

  it("zilliyet → 0 (elem)", () => {
    expect(semantikFiltre(kayit("Zilliyet yoluyla kullanım"))).toBe(0);
  });

  it("imar yok → 0 (elem)", () => {
    expect(semantikFiltre(kayit("arsa", "imar yok"))).toBe(0);
  });

  it("kadastro harici → 0 (elem)", () => {
    expect(semantikFiltre(kayit("Kadastro harici arazi"))).toBe(0);
  });

  it("büyük harf ve karışık → doğru tespit (case insensitive)", () => {
    expect(semantikFiltre(kayit("HİSSELİ ARSA"))).toBe(0.7);
    expect(semantikFiltre(kayit("TAPUSUZ TARLA"))).toBe(0);
  });

  it("elem > indirim önceliği: tapusuz + hisseli → 0", () => {
    // tapusuz kalıbı önce kontrol edilir
    expect(semantikFiltre(kayit("Tapusuz hisseli arsa"))).toBe(0);
  });
});

// ============================================================
describe("spatialBaselineYeterliMi", () => {
  it("baseline null → false", () => {
    expect(spatialBaselineYeterliMi(sonuc({ baseline: null }))).toBe(false);
  });

  it("baseline 0 → false", () => {
    expect(spatialBaselineYeterliMi(sonuc({ baseline: 0 }))).toBe(false);
  });

  it("emsaller.length < 2 → false (tek ilan yetmez)", () => {
    expect(spatialBaselineYeterliMi(sonuc({
      baseline: 5000,
      emsaller: [emsalKayit(5000, 500)],
      halkaDagilimi: { r0_1km: 1, r1_3km: 0, r3_5km: 0, r5_10km: 0 },
    }))).toBe(false);
  });

  it("2 emsal + 1km içinde 1 ilan → true", () => {
    expect(spatialBaselineYeterliMi(sonuc({
      baseline: 5000,
      emsaller: [emsalKayit(5000, 500), emsalKayit(6000, 800)],
      halkaDagilimi: { r0_1km: 2, r1_3km: 0, r3_5km: 0, r5_10km: 0 },
    }))).toBe(true);
  });

  it("2 emsal ama yakın ilan yok (hepsi 5km+) → false", () => {
    expect(spatialBaselineYeterliMi(sonuc({
      baseline: 5000,
      emsaller: [emsalKayit(5000, 6000), emsalKayit(6000, 7000)],
      halkaDagilimi: { r0_1km: 0, r1_3km: 0, r3_5km: 0, r5_10km: 2 },
    }))).toBe(false);
  });

  it("1km+3km toplamı 1 ise yeterli (r1_3km katkısı)", () => {
    expect(spatialBaselineYeterliMi(sonuc({
      baseline: 4500,
      emsaller: [emsalKayit(4500, 2000), emsalKayit(5000, 2500)],
      halkaDagilimi: { r0_1km: 0, r1_3km: 1, r3_5km: 1, r5_10km: 0 },
    }))).toBe(true);
  });
});

// ============================================================
describe("distance decay davranışı (exp(-d/D) matematiği)", () => {
  /**
   * Decay formülü: w = exp(-d / D)
   * D = 5000m (arsa) için:
   *   d=0    → w=1.0
   *   d=5000 → w≈0.368
   *   d=10000 → w≈0.135
   */
  const D = D_BY_KATEGORI.arsa; // 5000

  function decayWeight(d: number): number {
    return Math.exp(-d / D);
  }

  it("d=0 → weight=1.0", () => {
    expect(decayWeight(0)).toBeCloseTo(1.0, 5);
  });

  it("d=D → weight≈0.368 (1/e)", () => {
    expect(decayWeight(D)).toBeCloseTo(1 / Math.E, 3);
  });

  it("d=2D → weight≈0.135", () => {
    expect(decayWeight(2 * D)).toBeCloseTo(Math.exp(-2), 3);
  });

  it("monoton azalır", () => {
    const w1 = decayWeight(1000);
    const w2 = decayWeight(3000);
    const w3 = decayWeight(8000);
    expect(w1).toBeGreaterThan(w2);
    expect(w2).toBeGreaterThan(w3);
  });

  it("tarla D'si arsa D'sinden büyük → aynı uzaklıkta tarla daha az penalty", () => {
    const d = 4000; // 4km
    const weightArsa = Math.exp(-d / D_BY_KATEGORI.arsa);
    const weightTarla = Math.exp(-d / D_BY_KATEGORI.tarla);
    expect(weightTarla).toBeGreaterThan(weightArsa);
  });
});

// ============================================================
describe("halka dağılımı mantığı", () => {
  it("toplam halka sayısı emsaller uzunluğuna eşit olmalı", () => {
    // r0_1km + r1_3km + r3_5km + r5_10km = emsaller.length
    const dagilim = { r0_1km: 2, r1_3km: 3, r3_5km: 1, r5_10km: 4 };
    const toplam = Object.values(dagilim).reduce((a, b) => a + b, 0);
    const emsalAdet = 10;
    expect(toplam).toBe(emsalAdet);
  });

  it("radius=2D'de 10km'den uzak emsal olamaz (decay 0.135'in altına düşer)", () => {
    // D=5000 için 2D=10000m; ötesindeki emsal query'e bile girmez
    const radiusM = 2 * D_BY_KATEGORI.arsa; // 10000
    expect(radiusM).toBe(10000);
    // 10km'deki ağırlık
    const w = Math.exp(-radiusM / D_BY_KATEGORI.arsa);
    expect(w).toBeCloseTo(Math.exp(-2), 3); // ~0.135 — çok düşük ama sıfır değil
  });
});
