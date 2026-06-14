/**
 * Spatial emsal motor birim testleri.
 *
 * Dexie node env'da yok — bbox prefilter Dexie hatası fırlatır, fallback
 * full-scan da gerçek db'ye erişmeden çağrılır. Bu testler `semantikFiltre`,
 * `spatialBaselineYeterliMi`, `D_BY_KATEGORI` gibi pure fonksiyonları kapsar.
 */
import { describe, it, expect } from "vitest";
import {
  semantikFiltre,
  spatialBaselineYeterliMi,
  D_BY_KATEGORI,
  type SpatialEmsalSonuc,
} from "../src/lib/spatial-emsal";
import type { IlanGozlem } from "../src/lib/db";

const ilanBase: IlanGozlem = {
  kaynak: "sahibinden",
  ilanNo: "1",
  url: "https://x",
  baslik: null,
  ilAd: null,
  ilceAd: null,
  mahalleAd: null,
  imarDurumu: null,
  fiyat: 100,
  m2: 100,
  fiyatPerM2: 1,
  paraBirimi: "TL",
  adaNo: null,
  parselNo: null,
  zaman: Date.now(),
};

describe("semantikFiltre", () => {
  it("normal başlık → 1.0", () => {
    expect(semantikFiltre({ ...ilanBase, baslik: "Satılık arsa Beykoz" })).toBe(1.0);
  });
  it("hisseli → 0.7 (indirim)", () => {
    // Sahibinden başlıkları normalde "Hisseli" yazımıyla gelir.
    // tr-locale lowercase "HISSELI" → "hısselı" (I→ı), o yüzden büyük-harf değil
    // gerçek dünya örnek kullanılır.
    expect(semantikFiltre({ ...ilanBase, baslik: "Hisseli satılık arsa" })).toBe(0.7);
    expect(semantikFiltre({ ...ilanBase, baslik: "Paylı tapu" })).toBe(0.7);
    expect(semantikFiltre({ ...ilanBase, baslik: "intikal kalmış" })).toBe(0.7);
  });
  it("tapusuz/imar yok → 0 (elem)", () => {
    expect(semantikFiltre({ ...ilanBase, baslik: "Tapusuz arsa fırsat" })).toBe(0);
    expect(semantikFiltre({ ...ilanBase, baslik: "zilliyet" })).toBe(0);
    expect(semantikFiltre({ ...ilanBase, baslik: "imar yok" })).toBe(0);
  });
  it("imarDurumu metnine de bakar", () => {
    expect(semantikFiltre({ ...ilanBase, imarDurumu: "kadastro harici" })).toBe(0);
  });
});

describe("D_BY_KATEGORI", () => {
  it("konut < arsa < tarla", () => {
    expect(D_BY_KATEGORI.konut).toBeLessThan(D_BY_KATEGORI.arsa);
    expect(D_BY_KATEGORI.arsa).toBeLessThan(D_BY_KATEGORI.tarla);
  });
  it("makul mertebede (km cinsinden)", () => {
    expect(D_BY_KATEGORI.konut).toBe(2000);
    expect(D_BY_KATEGORI.arsa).toBe(5000);
    expect(D_BY_KATEGORI.tarla).toBe(8000);
  });
});

function sonucYap(p: Partial<SpatialEmsalSonuc>): SpatialEmsalSonuc {
  return {
    emsaller: [],
    halkaDagilimi: { r0_1km: 0, r1_3km: 0, r3_5km: 0, r5_10km: 0 },
    baseline: null,
    hamAdayAdet: 0,
    outlierAdet: 0,
    D: 5000,
    radiusM: 10000,
    ...p,
  };
}

describe("spatialBaselineYeterliMi", () => {
  it("baseline null → false", () => {
    expect(spatialBaselineYeterliMi(sonucYap({ baseline: null }))).toBe(false);
  });
  it("5'ten az emsal → false", () => {
    const s = sonucYap({
      baseline: 10000,
      emsaller: new Array(4).fill(null).map(() => ({} as never)),
    });
    expect(spatialBaselineYeterliMi(s)).toBe(false);
  });
  it("yakın bant (0-3km) en az 2 emsal şart", () => {
    const s = sonucYap({
      baseline: 10000,
      emsaller: new Array(6).fill(null).map(() => ({} as never)),
      halkaDagilimi: { r0_1km: 0, r1_3km: 1, r3_5km: 3, r5_10km: 2 },
    });
    expect(spatialBaselineYeterliMi(s)).toBe(false);
  });
  it("5+ emsal + 2+ yakın → true", () => {
    const s = sonucYap({
      baseline: 10000,
      emsaller: new Array(6).fill(null).map(() => ({} as never)),
      halkaDagilimi: { r0_1km: 1, r1_3km: 2, r3_5km: 3, r5_10km: 0 },
    });
    expect(spatialBaselineYeterliMi(s)).toBe(true);
  });
  it("baseline negatif/sıfır → false", () => {
    expect(spatialBaselineYeterliMi(sonucYap({ baseline: 0 }))).toBe(false);
    expect(spatialBaselineYeterliMi(sonucYap({ baseline: -5 }))).toBe(false);
  });
});
