/**
 * Milli Emlak normalize testleri.
 *
 * Fixture'lar canlı API'den (mebis-s-p.csb.gov.tr/api/MileWeb/GetSatisIlanList)
 * alınmış gerçek kayıtlardır; API biçimi değişirse bu testler kırılır ve sessiz
 * veri kaybı yerine görünür hata alırız.
 */
import { describe, it, expect } from "vitest";
import {
  tasinmazNormalize,
  mahalleNormalize,
  tarihMs,
} from "../src/lib/milli-emlak-scraper.js";

// Canlı API'den alınmış gerçek kayıt (Gümüşhane/Kelkit)
const GERCEK = {
  il: "Gümüşhane",
  ilce: "Kelkit",
  mahalle: "Salördek Köyü",
  ada: "144",
  parsel: "8",
  tasinmaz_cinsi: "Arazi",
  imar_durumu: "Hayır",
  yuzolcumu: 200.0,
  hazine_yuzolcumu: 200.0,
  satilacak_yuzolcumu: null,
  toplam_tahmini_bedel: 36000.0,
  ihale_tarihi: "2026-09-02T00:00:00",
};

describe("mahalleNormalize", () => {
  it("'Köyü' son ekini atar ve Türkçe karakterleri normalize eder", () => {
    expect(mahalleNormalize("Salördek Köyü")).toBe("salordek");
  });
  it("'Mahallesi' son ekini atar", () => {
    expect(mahalleNormalize("Cumhuriyet Mahallesi")).toBe("cumhuriyet");
  });
  it("boş girdide null döner", () => {
    expect(mahalleNormalize(null)).toBeNull();
    expect(mahalleNormalize("   ")).toBeNull();
  });
});

describe("tarihMs", () => {
  it("ISO tarihi unix ms'e çevirir", () => {
    expect(tarihMs("2026-09-02T00:00:00")).toBe(Date.parse("2026-09-02T00:00:00"));
  });
  it("geçersiz/boş tarihte null döner", () => {
    expect(tarihMs(null)).toBeNull();
    expect(tarihMs("saçma")).toBeNull();
  });
});

describe("tasinmazNormalize", () => {
  it("gerçek kaydı doğru normalize eder", () => {
    const k = tasinmazNormalize(GERCEK, 2930844)!;
    expect(k).not.toBeNull();
    expect(k.ilNorm).toBe("gumushane");
    expect(k.ilceNorm).toBe("kelkit");
    expect(k.mahalleNorm).toBe("salordek");
    expect(k.adaNo).toBe("144");
    expect(k.parselNo).toBe("8");
    expect(k.m2).toBe(200);
    expect(k.muhammenBedel).toBe(36000);
    expect(k.fiyatPerM2).toBe(180); // 36000 / 200
    expect(k.kaynakUrl).toContain("2930844");
  });

  it("satilacak_yuzolcumu varsa onu kullanır (kısmi satış)", () => {
    // Hazine parselin tamamını değil bir kısmını satabiliyor; bedel o kısma ait,
    // dolayısıyla TL/m² ancak satılan alanla eşleşirse doğru çıkar.
    const k = tasinmazNormalize({
      ...GERCEK, yuzolcumu: 1000, satilacak_yuzolcumu: 200,
    })!;
    expect(k.m2).toBe(200);
    expect(k.fiyatPerM2).toBe(180);
  });

  it("arazi olmayan taşınmazı (bina/konut) eler", () => {
    expect(tasinmazNormalize({ ...GERCEK, tasinmaz_cinsi: "Betonarme Bina" })).toBeNull();
    expect(tasinmazNormalize({ ...GERCEK, tasinmaz_cinsi: "Mesken" })).toBeNull();
  });

  it("Arsa / Tarla / Bağ-Bahçe cinslerini kabul eder", () => {
    for (const c of ["Arsa", "Tarla", "Bağ-Bahçe", "Zeytinlik"]) {
      expect(tasinmazNormalize({ ...GERCEK, tasinmaz_cinsi: c })).not.toBeNull();
    }
  });

  it("il/ilçe eksikse eler", () => {
    expect(tasinmazNormalize({ ...GERCEK, il: "" })).toBeNull();
    expect(tasinmazNormalize({ ...GERCEK, ilce: undefined })).toBeNull();
  });

  it("bedel yoksa kayıt yine üretilir ama fiyatPerM2 null olur", () => {
    const k = tasinmazNormalize({ ...GERCEK, toplam_tahmini_bedel: null })!;
    expect(k).not.toBeNull();
    expect(k.muhammenBedel).toBeNull();
    expect(k.fiyatPerM2).toBeNull();
  });

  it("saçma TL/m² değerlerini eler (birim karışıklığı koruması)", () => {
    // 1 m²'ye 100 milyar TL — veri hatası
    const k = tasinmazNormalize({ ...GERCEK, yuzolcumu: 1, toplam_tahmini_bedel: 1e11 })!;
    expect(k.fiyatPerM2).toBeNull();
    expect(k.muhammenBedel).toBe(1e11); // ham bedel yine saklanır
  });

  it("ada/parsel boşsa null olarak geçer, kayıt düşmez", () => {
    const k = tasinmazNormalize({ ...GERCEK, ada: "", parsel: "  " })!;
    expect(k.adaNo).toBeNull();
    expect(k.parselNo).toBeNull();
  });
});
