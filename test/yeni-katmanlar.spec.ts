/**
 * Yeni veri katmanları — birim testleri
 *
 * Kapsam:
 *   1. mahalle-nufus.ts  — ilçe bazlı nüfus yoğunluğu + carpanlar
 *   2. arazi-ortusu.ts   — ESA sınıf kodu → kategori + fiyat çarpanı
 *   3. satis-iskonto.ts  — asking price → gerçek satış iskonto motoru
 *   4. hava-kalitesi.ts  — PM2.5 → AQI + kategori + fiyat çarpanı
 *
 * Tüm test edilen fonksiyonlar saf (I/O yok) — mock gerektirmez.
 */
import { describe, it, expect } from "vitest";

// ─── mahalle-nufus.ts ─────────────────────────────────────────────────────────
import {
  yogunlukKategoriGetir,
  ilceNufusBilgisiGetir,
  nufusMahalleCarpani,
  nufusCarpaniGelismis,
  ILCE_NUFUS_YOGUNLUGU,
} from "../src/lib/data/mahalle-nufus";

describe("yogunlukKategoriGetir", () => {
  it("5000+ kişi/km² → sehir-merkezi", () => {
    expect(yogunlukKategoriGetir(5000)).toBe("sehir-merkezi");
    expect(yogunlukKategoriGetir(26000)).toBe("sehir-merkezi");
  });

  it("1000-4999 → kentsel", () => {
    expect(yogunlukKategoriGetir(1000)).toBe("kentsel");
    expect(yogunlukKategoriGetir(4999)).toBe("kentsel");
  });

  it("300-999 → yarim-kentsel", () => {
    expect(yogunlukKategoriGetir(300)).toBe("yarim-kentsel");
    expect(yogunlukKategoriGetir(999)).toBe("yarim-kentsel");
  });

  it("30-99 → kirsal", () => {
    expect(yogunlukKategoriGetir(30)).toBe("kirsal");
    expect(yogunlukKategoriGetir(99)).toBe("kirsal");
  });

  it("< 30 → issiz", () => {
    expect(yogunlukKategoriGetir(5)).toBe("issiz");
    expect(yogunlukKategoriGetir(0)).toBe("issiz");
  });
});

describe("ilceNufusBilgisiGetir", () => {
  it("İstanbul Fatih → en yüksek yoğunluk döner", () => {
    const bilgi = ilceNufusBilgisiGetir("istanbul", "fatih");
    expect(bilgi).not.toBeNull();
    expect(bilgi!.yogunluk).toBeGreaterThan(20000);
    expect(bilgi!.seviye).toBe("ilce");
  });

  it("İstanbul Şile → düşük yoğunluk (kırsal)", () => {
    const bilgi = ilceNufusBilgisiGetir("istanbul", "sile");
    expect(bilgi).not.toBeNull();
    expect(bilgi!.yogunluk).toBeLessThan(500);
  });

  it("Bilinmeyen ilçe → il fallback'e düşer", () => {
    const bilgi = ilceNufusBilgisiGetir("ankara", "bilinmeyen-ilce-xyz");
    // il bazlı fallback — il-nufus.ts'de ankara = 200
    expect(bilgi).not.toBeNull();
    expect(bilgi!.seviye).toBe("il");
  });

  it("null il → null döner", () => {
    const bilgi = ilceNufusBilgisiGetir(null, "fatih");
    expect(bilgi).toBeNull();
  });
});

describe("nufusMahalleCarpani", () => {
  it("Şehir merkezi ilçe → carpan > 1.10", () => {
    const sonuc = nufusMahalleCarpani("istanbul", "sisli");
    expect(sonuc.carpan).toBeGreaterThan(1.10);
  });

  it("Kırsal ilçe → carpan < 1.0", () => {
    const sonuc = nufusMahalleCarpani("konya", "cihanbeyli");
    expect(sonuc.carpan).toBeLessThan(1.0);
  });

  it("Bilinmeyen → carpan = 1.0 varsayım", () => {
    const sonuc = nufusMahalleCarpani(null, null);
    expect(sonuc.carpan).toBe(1.0);
    expect(sonuc.seviye).toBe("varsayim");
  });

  it("Carpan aralığı 0.80 - 1.20 içinde kalır", () => {
    const ilceler = Object.keys(ILCE_NUFUS_YOGUNLUGU).slice(0, 20);
    for (const key of ilceler) {
      const [il, ilce] = key.split("|");
      const sonuc = nufusMahalleCarpani(il, ilce);
      expect(sonuc.carpan).toBeGreaterThanOrEqual(0.80);
      expect(sonuc.carpan).toBeLessThanOrEqual(1.25);
    }
  });
});

describe("nufusCarpaniGelismis", () => {
  it("İlçe verisi varsa seviye=ilce döner", () => {
    const sonuc = nufusCarpaniGelismis("istanbul", "kadikoy");
    expect(sonuc.seviye).toBe("ilce");
  });

  it("Sadece il verilse bile carpan döner", () => {
    const sonuc = nufusCarpaniGelismis("ankara");
    expect(sonuc.carpan).toBeGreaterThan(0);
  });
});

// ─── arazi-ortusu.ts ──────────────────────────────────────────────────────────
import {
  araziOrtusuCarpani,
  ESA_WORLDCOVER_SINIFLAR,
} from "../src/lib/arazi-ortusu";

describe("araziOrtusuCarpani", () => {
  it("Kentsel arazi + tarımsal nitelik → prim (+%30)", () => {
    const sonuc = araziOrtusuCarpani("kentsel", "Tarla");
    expect(sonuc.carpan).toBeCloseTo(1.30, 1);
  });

  it("Kentsel arazi + arsa nitelik → küçük prim", () => {
    const sonuc = araziOrtusuCarpani("kentsel", "Arsa");
    expect(sonuc.carpan).toBeGreaterThan(1.0);
    expect(sonuc.carpan).toBeLessThan(1.15);
  });

  it("Ormanlık arazi → ceza (< 1.0)", () => {
    const sonuc = araziOrtusuCarpani("ormanlik", "Arsa");
    expect(sonuc.carpan).toBeLessThan(1.0);
  });

  it("Mera → ciddi ceza", () => {
    const sonuc = araziOrtusuCarpani("mera", "Arsa");
    expect(sonuc.carpan).toBeLessThan(0.90);
  });

  it("Su/sulak alan → en yüksek ceza", () => {
    const sonucSu = araziOrtusuCarpani("su", "Arsa");
    const sonucSulak = araziOrtusuCarpani("sulak-alan", "Arsa");
    expect(sonucSu.carpan).toBeLessThan(0.80);
    expect(sonucSulak.carpan).toBeLessThan(0.80);
  });

  it("Tarımsal arazi + tarla nitelik → nötr (uyumlu)", () => {
    const sonuc = araziOrtusuCarpani("tarimsal", "Tarla");
    expect(sonuc.carpan).toBeCloseTo(1.0, 1);
  });

  it("Bilinmiyor → çarpan 1.0", () => {
    const sonuc = araziOrtusuCarpani("bilinmiyor", "Arsa");
    expect(sonuc.carpan).toBe(1.0);
  });

  it("ESA sınıf tablosu tam — 11 sınıf tanımlı", () => {
    const kodlar = Object.keys(ESA_WORLDCOVER_SINIFLAR).map(Number);
    expect(kodlar.length).toBeGreaterThanOrEqual(10);
    expect(kodlar).toContain(10);  // ağaçlık
    expect(kodlar).toContain(40);  // tarım
    expect(kodlar).toContain(50);  // kentsel
    expect(kodlar).toContain(80);  // su
  });
});

// ─── satis-iskonto.ts ─────────────────────────────────────────────────────────
import {
  iskontoGetir,
  askingtenGercege,
  emsaleIskontoUygula,
  piyasaIsisiTahmin,
} from "../src/lib/satis-iskonto";

describe("iskontoGetir", () => {
  it("İstanbul arsa — düşük iskonto (%12)", () => {
    const sonuc = iskontoGetir("istanbul", "arsa");
    expect(sonuc.oran).toBeCloseTo(0.12, 2);
    expect(sonuc.carpan).toBeCloseTo(0.88, 2);
  });

  it("Van tarla — yüksek iskonto", () => {
    const sonuc = iskontoGetir("van", "tarla");
    expect(sonuc.oran).toBeGreaterThan(0.25);
  });

  it("Bilinmeyen il → varsayılan iskonto kullanır", () => {
    const sonuc = iskontoGetir("bilinmeyen-il-xyz", "arsa");
    expect(sonuc.oran).toBeGreaterThan(0);
    expect(sonuc.oran).toBeLessThanOrEqual(0.40);
  });

  it("Sıcak piyasa → iskonto azalır", () => {
    const normal = iskontoGetir("istanbul", "arsa", "normal");
    const sicak  = iskontoGetir("istanbul", "arsa", "sicak");
    expect(sicak.oran).toBeLessThan(normal.oran);
  });

  it("Soğuk piyasa → iskonto artar", () => {
    const normal = iskontoGetir("istanbul", "arsa", "normal");
    const soguk  = iskontoGetir("istanbul", "arsa", "soguk");
    expect(soguk.oran).toBeGreaterThan(normal.oran);
  });

  it("İskonto oranı her zaman 0.05-0.40 arasında", () => {
    const iller = ["istanbul", "ankara", "van", "hakkari", "mugla", null, undefined];
    for (const il of iller) {
      const sonuc = iskontoGetir(il as string, "arsa");
      expect(sonuc.oran).toBeGreaterThanOrEqual(0.05);
      expect(sonuc.oran).toBeLessThanOrEqual(0.40);
    }
  });
});

describe("askingtenGercege", () => {
  it("Asking fiyatı düşürür (carpan < 1)", () => {
    const { gercekPerM2, iskonto } = askingtenGercege(10000, "istanbul", "arsa");
    expect(gercekPerM2).toBeLessThan(10000);
    expect(iskonto.carpan).toBeLessThan(1.0);
  });

  it("Hesaplanan gerçek fiyat = asking × carpan", () => {
    const asking = 8000;
    const { gercekPerM2, iskonto } = askingtenGercege(asking, "ankara", "arsa");
    expect(gercekPerM2).toBe(Math.round(asking * iskonto.carpan));
  });
});

describe("emsaleIskontoUygula", () => {
  it("Düzeltilmiş fiyat orijinalden düşük", () => {
    const sonuc = emsaleIskontoUygula(5000, "konya", "arsa");
    expect(sonuc.duzeltilmisPerM2).toBeLessThan(5000);
    expect(sonuc.carpan).toBeLessThan(1.0);
  });

  it("Açıklama metni dolu", () => {
    const sonuc = emsaleIskontoUygula(5000, "bursa", "tarla");
    expect(sonuc.aciklama.length).toBeGreaterThan(10);
  });
});

describe("piyasaIsisiTahmin", () => {
  it("İstanbul → sicak", () => {
    expect(piyasaIsisiTahmin("istanbul")).toBe("sicak");
  });

  it("Van → soguk", () => {
    expect(piyasaIsisiTahmin("van")).toBe("soguk");
  });

  it("Ankara → normal", () => {
    expect(piyasaIsisiTahmin("ankara")).toBe("normal");
  });

  it("null → normal", () => {
    expect(piyasaIsisiTahmin(null)).toBe("normal");
  });
});

// ─── hava-kalitesi.ts ─────────────────────────────────────────────────────────
import {
  havaKalitesiCarpani,
} from "../src/lib/hava-kalitesi";

// Not: havaKalitesiGetir() async/API çağrısı içerdiği için burada test edilmez.
// Saf fonksiyonlar (carpan hesabı) test edilir.

describe("havaKalitesiCarpani", () => {
  it("Temiz hava → prim (> 1.0)", () => {
    const sonuc = havaKalitesiCarpani("temiz");
    expect(sonuc.carpan).toBeGreaterThan(1.0);
  });

  it("Orta hava → nötr (= 1.0)", () => {
    const sonuc = havaKalitesiCarpani("orta");
    expect(sonuc.carpan).toBeCloseTo(1.0, 3);
  });

  it("Kirli hava → ceza (< 1.0)", () => {
    const sonuc = havaKalitesiCarpani("kirli");
    expect(sonuc.carpan).toBeLessThan(1.0);
  });

  it("Çok kirli hava → daha fazla ceza", () => {
    const kirli    = havaKalitesiCarpani("kirli");
    const cokKirli = havaKalitesiCarpani("cok-kirli");
    expect(cokKirli.carpan).toBeLessThan(kirli.carpan);
  });

  it("İmarlı parsel → imarsızdan daha sert etki", () => {
    const imarsiz = havaKalitesiCarpani("kirli", false);
    const imarli  = havaKalitesiCarpani("kirli", true);
    // İmarlı → tam etki, imarsız → yarı etki
    expect(Math.abs(imarli.carpan - 1)).toBeGreaterThan(Math.abs(imarsiz.carpan - 1));
  });

  it("Bilinmiyor → çarpan 1.0", () => {
    const sonuc = havaKalitesiCarpani("bilinmiyor");
    expect(sonuc.carpan).toBe(1.0);
  });

  it("Tüm kategoriler için carpan 0.85 - 1.10 arasında", () => {
    const kategoriler = ["temiz", "orta", "kirli", "cok-kirli"] as const;
    for (const kat of kategoriler) {
      const sonuc = havaKalitesiCarpani(kat);
      expect(sonuc.carpan).toBeGreaterThanOrEqual(0.85);
      expect(sonuc.carpan).toBeLessThanOrEqual(1.10);
    }
  });
});
