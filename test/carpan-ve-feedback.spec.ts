/**
 * carpan-zinciri.ts + gercek-fiyat.ts birim testleri
 *
 * Kapsam:
 *   1. carpan-zinciri.ts — tüm pure çarpan fonksiyonları + kümülatif cap
 *   2. gercek-fiyat.ts  — tahmin/gerçek karşılaştırma (I/O gerektirmeyen)
 *
 * Mock gerektirmeyen pure fonksiyonlar test edilir.
 */
import { describe, it, expect } from "vitest";

// ─── carpan-zinciri.ts ────────────────────────────────────────────────────────
import {
  nitelikCarpani,
  alanCarpani,
  alanBandi,
  alanBandUyumu,
  segmentBul,
  segmentUyumu,
  imarUyumu,
  alanBenzerlikSkoru,
  cevreCarpani,
  egimCarpani,
  kirsalCarpani,
  carpanZinciriUygula,
  CARPAN_CAP_MIN,
  CARPAN_CAP_MAX,
  tarımsalMi,
  type ImarSinifi,
} from "../src/lib/carpan-zinciri";

// Mock parsel — imar sınıflandırması için
const mockParsel = {
  nitelik: "Arsa",
  ilAd: "İstanbul",
  ilceAd: "Kadıköy",
  mahalleAd: "Moda",
  mahalleKodu: 12345,
  adaNo: 100,
  parselNo: 5,
  alan: 500,
} as any;

// ─── tarımsalMi ───────────────────────────────────────────────────────────────
describe("tarımsalMi", () => {
  it("Tarla → true", () => expect(tarımsalMi("Tarla")).toBe(true));
  it("Bahçe → true", () => expect(tarımsalMi("Bahçe")).toBe(true));
  it("Zeytinlik → true", () => expect(tarımsalMi("Zeytinlik")).toBe(true));
  it("Arsa → false", () => expect(tarımsalMi("Arsa")).toBe(false));
  it("Mesken → false", () => expect(tarımsalMi("Mesken")).toBe(false));
});

// ─── nitelikCarpani ───────────────────────────────────────────────────────────
describe("nitelikCarpani", () => {
  it("Arsa → 1.0 (baseline)", () => {
    expect(nitelikCarpani("Arsa").carpan).toBeCloseTo(1.0);
  });

  it("Tarla → 0.25 (tarımsal kısıt)", () => {
    expect(nitelikCarpani("Tarla").carpan).toBeCloseTo(0.25);
  });

  it("Mesken/Bina → 2.5 (yapı mevcut)", () => {
    expect(nitelikCarpani("Mesken").carpan).toBeCloseTo(2.5);
  });

  it("Zeytinlik → 0.4 (yasal kısıt)", () => {
    expect(nitelikCarpani("Zeytinlik").carpan).toBeCloseTo(0.4);
  });

  it("Yol → 0 (kamu yolu)", () => {
    expect(nitelikCarpani("Yol Terfi").carpan).toBeCloseTo(0);
  });

  it("Bilinmeyen nitelik → 0.5 fallback", () => {
    expect(nitelikCarpani("XYZ bilinmiyor").carpan).toBeCloseTo(0.5);
  });
});

// ─── alanCarpani ──────────────────────────────────────────────────────────────
describe("alanCarpani", () => {
  // Değerler veri setinden aynı-mahalle içi karşılaştırmayla türetildi.
  it("< 200m² → 1.47 mikro prim", () => {
    expect(alanCarpani(150).carpan).toBeCloseTo(1.47);
  });

  it("200-750m² → 1.27 küçük prim", () => {
    expect(alanCarpani(500).carpan).toBeCloseTo(1.27);
  });

  it("750-2500m² → 1.0 referans", () => {
    expect(alanCarpani(1500).carpan).toBeCloseTo(1.0);
  });

  it("2500-10000m² → 0.67 büyük parsel", () => {
    expect(alanCarpani(5000).carpan).toBeCloseTo(0.67);
  });

  it("> 10000m² → 0.38 çok büyük", () => {
    expect(alanCarpani(15000).carpan).toBeCloseTo(0.38);
  });

  it("Alan arttıkça çarpan monoton azalır", () => {
    const alanlar = [100, 500, 1500, 5000, 15000];
    const carpanlar = alanlar.map((a) => alanCarpani(a).carpan);
    for (let i = 0; i < carpanlar.length - 1; i++) {
      expect(carpanlar[i]).toBeGreaterThanOrEqual(carpanlar[i + 1]!);
    }
  });
});

// ─── alanBandi ────────────────────────────────────────────────────────────────
describe("alanBandi", () => {
  it("100m² → micro", () => expect(alanBandi(100)).toBe("micro"));
  it("500m² → kucuk", () => expect(alanBandi(500)).toBe("kucuk"));
  it("2000m² → orta", () => expect(alanBandi(2000)).toBe("orta"));
  it("10000m² → buyuk", () => expect(alanBandi(10000)).toBe("buyuk"));
  it("50000m² → cok-buyuk", () => expect(alanBandi(50000)).toBe("cok-buyuk"));
});

// ─── alanBandUyumu ────────────────────────────────────────────────────────────
describe("alanBandUyumu", () => {
  it("Aynı band → 1.0", () => {
    expect(alanBandUyumu(500, 600)).toBeCloseTo(1.0);
  });

  it("1 band fark → 0.86", () => {
    expect(alanBandUyumu(500, 1500)).toBeCloseTo(0.86);
  });

  it("2 band fark → 0.68", () => {
    expect(alanBandUyumu(100, 2000)).toBeCloseTo(0.68);
  });

  it("null ilan m² → 0.7 fallback", () => {
    expect(alanBandUyumu(500, null)).toBeCloseTo(0.7);
  });
});

// ─── segmentBul ───────────────────────────────────────────────────────────────
describe("segmentBul", () => {
  it("'arsa' → arsa", () => expect(segmentBul("arsa")).toBe("arsa"));
  it("'tarla' → tarla", () => expect(segmentBul("tarla")).toBe("tarla"));
  it("'bahçe' → bahce", () => expect(segmentBul("bahçe")).toBe("bahce"));
  it("'yol' → road", () => expect(segmentBul("yol")).toBe("road"));
  it("null → other", () => expect(segmentBul(null)).toBe("other"));
  it("boş → other", () => expect(segmentBul("")).toBe("other"));
});

// ─── segmentUyumu ─────────────────────────────────────────────────────────────
describe("segmentUyumu", () => {
  it("Aynı segment → 1.0", () => {
    expect(segmentUyumu("arsa", "arsa")).toBeCloseTo(1.0);
  });

  it("Her ikisi de tarımsal → 0.80", () => {
    expect(segmentUyumu("tarla", "bahce")).toBeCloseTo(0.80);
  });

  it("Yol içeriyorsa → 0", () => {
    expect(segmentUyumu("road", "arsa")).toBeCloseTo(0);
    expect(segmentUyumu("arsa", "road")).toBeCloseTo(0);
  });

  it("Kentsel vs tarımsal → 0.40", () => {
    expect(segmentUyumu("arsa", "tarla")).toBeCloseTo(0.40);
  });
});

// ─── imarUyumu ────────────────────────────────────────────────────────────────
describe("imarUyumu", () => {
  it("Aynı sınıf → 1.0", () => {
    const s: ImarSinifi = "konut-imarli";
    expect(imarUyumu(s, s)).toBeCloseTo(1.0);
  });

  it("Belirsiz sınıf → 0.7", () => {
    expect(imarUyumu("belirsiz", "konut-imarli")).toBeCloseTo(0.7);
  });

  it("Farklı net sınıflar → 0.4", () => {
    expect(imarUyumu("konut-imarli", "sanayi-imarli")).toBeCloseTo(0.4);
  });
});

// ─── alanBenzerlikSkoru ───────────────────────────────────────────────────────
describe("alanBenzerlikSkoru", () => {
  it("Aynı büyüklükte → 1.0", () => {
    expect(alanBenzerlikSkoru(1000, 1000)).toBeCloseTo(1.0);
  });

  it("Oran > 0.7 → 1.0", () => {
    expect(alanBenzerlikSkoru(1000, 800)).toBeCloseTo(1.0);
  });

  it("Oran 0.4-0.7 → 0.8", () => {
    expect(alanBenzerlikSkoru(1000, 500)).toBeCloseTo(0.8);
  });

  it("null ilan → 0.45 fallback", () => {
    expect(alanBenzerlikSkoru(1000, null)).toBeCloseTo(0.45);
  });
});

// ─── cevreCarpani ─────────────────────────────────────────────────────────────
describe("cevreCarpani", () => {
  it("null çevre → 1.0", () => {
    expect(cevreCarpani(null).carpan).toBeCloseTo(1.0);
  });

  it("15+ POI → 1.15 yoğun şehir", () => {
    const cevre = { poi: { okul: 8, hastane: 5, duraklar: 5, market: 0, benzin: 0, trafo: 0 } } as any;
    expect(cevreCarpani(cevre).carpan).toBeCloseTo(1.15);
  });

  it("0 POI → 0.90 kırsal", () => {
    const cevre = { poi: { okul: 0, hastane: 0, duraklar: 0, market: 0, benzin: 0, trafo: 0 } } as any;
    expect(cevreCarpani(cevre).carpan).toBeCloseTo(0.90);
  });

  it("3-7 POI → 1.05 orta", () => {
    const cevre = { poi: { okul: 2, hastane: 1, duraklar: 1, market: 0, benzin: 0, trafo: 0 } } as any;
    expect(cevreCarpani(cevre).carpan).toBeCloseTo(1.05);
  });
});

// ─── egimCarpani ──────────────────────────────────────────────────────────────
describe("egimCarpani", () => {
  it("null → 1.0", () => expect(egimCarpani(null).carpan).toBeCloseTo(1.0));
  it("düz → 1.05", () => expect(egimCarpani({ egimKategori: "duz" } as any).carpan).toBeCloseTo(1.05));
  it("hafif → 1.0", () => expect(egimCarpani({ egimKategori: "hafif" } as any).carpan).toBeCloseTo(1.0));
  it("orta → 0.92", () => expect(egimCarpani({ egimKategori: "orta" } as any).carpan).toBeCloseTo(0.92));
  it("dik → 0.78", () => expect(egimCarpani({ egimKategori: "dik" } as any).carpan).toBeCloseTo(0.78));
  it("çok-dik → 0.55", () => expect(egimCarpani({ egimKategori: "cok-dik" } as any).carpan).toBeCloseTo(0.55));
});

// ─── kirsalCarpani ────────────────────────────────────────────────────────────
describe("kirsalCarpani", () => {
  it("Arsa niteliği → uygulanmaz (1.0)", () => {
    expect(kirsalCarpani("Arsa", null).carpan).toBeCloseTo(1.0);
  });

  it("Tarla + kirsal null → 1.0 fallback", () => {
    expect(kirsalCarpani("Tarla", null).carpan).toBeCloseTo(1.0);
  });

  it("Tarla + yola yakın (15m) → prim var", () => {
    const kirsal = { yolaCepheM: 10, suKaynagiM: null, koyMerkeziM: null } as any;
    expect(kirsalCarpani("Tarla", kirsal).carpan).toBeGreaterThan(1.0);
  });

  it("Tarla + yola uzak → ceza var", () => {
    const kirsal = { yolaCepheM: 5000, suKaynagiM: null, koyMerkeziM: null } as any;
    expect(kirsalCarpani("Tarla", kirsal).carpan).toBeLessThan(1.0);
  });

  it("Tarla çarpanı her zaman 0.6-1.8 arasında", () => {
    const senaryolar = [
      { yolaCepheM: 5, suKaynagiM: 100, koyMerkeziM: 100 },
      { yolaCepheM: 10000, suKaynagiM: null, koyMerkeziM: null },
      { yolaCepheM: null, suKaynagiM: null, koyMerkeziM: null },
    ];
    for (const k of senaryolar) {
      const c = kirsalCarpani("Tarla", k as any).carpan;
      expect(c).toBeGreaterThanOrEqual(0.6);
      expect(c).toBeLessThanOrEqual(1.8);
    }
  });
});

// ─── carpanZinciriUygula (cap) ─────────────────────────────────────────────────
describe("carpanZinciriUygula", () => {
  it("Normal çarpanlar → cap uygulanmaz", () => {
    const bilesenler = [
      { ad: "Alan", carpan: 1.5, not: "" },
      { ad: "Çevre", carpan: 1.05, not: "" },
      { ad: "Eğim", carpan: 0.92, not: "" },
    ];
    const sonuc = carpanZinciriUygula(bilesenler);
    expect(sonuc.capUygulandiMi).toBe(false);
    expect(sonuc.toplamCarpan).toBeCloseTo(1.5 * 1.05 * 0.92, 3);
  });

  it("Aşırı yüksek çarpanlar → cap uygulanır (max 1.60)", () => {
    const bilesenler = [
      { ad: "C1", carpan: 1.5, not: "" },
      { ad: "C2", carpan: 1.4, not: "" },
      { ad: "C3", carpan: 1.3, not: "" },
    ]; // 1.5 × 1.4 × 1.3 = 2.73 > 1.60
    const sonuc = carpanZinciriUygula(bilesenler);
    expect(sonuc.capUygulandiMi).toBe(true);
    expect(sonuc.toplamCarpan).toBeCloseTo(CARPAN_CAP_MAX);
    expect(sonuc.hamCarpan).toBeGreaterThan(CARPAN_CAP_MAX);
  });

  it("Aşırı düşük çarpanlar → cap uygulanır (min 0.40)", () => {
    const bilesenler = [
      { ad: "C1", carpan: 0.5, not: "" },
      { ad: "C2", carpan: 0.5, not: "" },
      { ad: "C3", carpan: 0.5, not: "" },
    ]; // 0.5^3 = 0.125 < 0.40
    const sonuc = carpanZinciriUygula(bilesenler);
    expect(sonuc.capUygulandiMi).toBe(true);
    expect(sonuc.toplamCarpan).toBeCloseTo(CARPAN_CAP_MIN);
  });

  it("Boş çarpan listesi → toplam 1.0", () => {
    const sonuc = carpanZinciriUygula([]);
    expect(sonuc.toplamCarpan).toBeCloseTo(1.0);
    expect(sonuc.capUygulandiMi).toBe(false);
  });

  it("Cap sabitleri mantıklı aralıkta", () => {
    expect(CARPAN_CAP_MIN).toBeGreaterThan(0);
    expect(CARPAN_CAP_MIN).toBeLessThan(1);
    expect(CARPAN_CAP_MAX).toBeGreaterThan(1);
    expect(CARPAN_CAP_MAX).toBeLessThanOrEqual(2);
  });
});

// ─── gercek-fiyat.ts saf fonksiyonları ────────────────────────────────────────
import {
  tahminGercekKarsilastir,
} from "../src/lib/gercek-fiyat";

describe("tahminGercekKarsilastir", () => {
  it("Tahmin yok → yon null", () => {
    const sonuc = tahminGercekKarsilastir(5000, null);
    expect(sonuc.yon).toBeNull();
    expect(sonuc.hataorani).toBeNull();
  });

  it("Tahmin gerçeğe eşit → yon dogru", () => {
    const sonuc = tahminGercekKarsilastir(5000, 5000);
    expect(sonuc.yon).toBe("dogru");
    expect(sonuc.hataorani).toBeCloseTo(0);
  });

  it("Tahmin fazla (%15 yüksek) → yon fazla", () => {
    const sonuc = tahminGercekKarsilastir(5000, 5750);
    expect(sonuc.yon).toBe("fazla");
    expect(sonuc.hataorani).toBeGreaterThan(0);
  });

  it("Tahmin eksik (%20 düşük) → yon eksik", () => {
    const sonuc = tahminGercekKarsilastir(5000, 4000);
    expect(sonuc.yon).toBe("eksik");
    expect(sonuc.hataorani).toBeLessThan(0);
  });

  it("Hata oranı formülü doğru: (tahmin - gerçek) / gerçek × 100", () => {
    const gercek = 4000;
    const tahmin = 5000;
    const beklenen = ((tahmin - gercek) / gercek) * 100; // +25
    const sonuc = tahminGercekKarsilastir(gercek, tahmin);
    expect(sonuc.hataorani).toBeCloseTo(beklenen, 1);
  });

  it("Açıklama metni dolu ve anlamlı", () => {
    const sonuc = tahminGercekKarsilastir(5000, 6000);
    expect(sonuc.aciklama.length).toBeGreaterThan(10);
    expect(typeof sonuc.aciklama).toBe("string");
  });
});
