/**
 * elevation.ts — Bug 5 regresyon + IDW hesap testi.
 *
 * egimAnaliziGetir node ortamında çalışmaz (fetch + signal).
 * Bunun yerine fix'in mantığını (geçersiz köşe filtresi) ve
 * spatial-emsal.ts'deki idwHesapla pure fonksiyonunu test ediyoruz.
 */
import { describe, it, expect } from "vitest";
import { idwHesapla } from "../src/lib/spatial-emsal";

// elevation.ts'deki geçerli köşe filtresi mantığını inline test
function gecerliKoseler(
  merkez: { lat: number; lng: number },
  koseler: { lat: number; lng: number }[],
): { lat: number; lng: number }[] {
  return koseler.filter(
    (p) => p.lat !== 0 && p.lng !== 0 && !(p.lat === merkez.lat && p.lng === merkez.lng),
  );
}

describe("elevation koordinat filtresi — Bug 5 regresyon", () => {
  const merkez = { lat: 40.5, lng: 30.5 };

  it("[0,0] köşeleri filtreler", () => {
    const koseler = [
      { lat: 0, lng: 0 },       // geçersiz
      { lat: 40.6, lng: 30.6 }, // geçerli
      { lat: 0, lng: 30.5 },    // geçersiz
    ];
    expect(gecerliKoseler(merkez, koseler)).toHaveLength(1);
    expect(gecerliKoseler(merkez, koseler)[0]).toEqual({ lat: 40.6, lng: 30.6 });
  });

  it("merkez ile aynı köşeleri filtreler", () => {
    const koseler = [
      { lat: 40.5, lng: 30.5 }, // merkez ile aynı — filtrele
      { lat: 40.6, lng: 30.6 }, // geçerli
    ];
    expect(gecerliKoseler(merkez, koseler)).toHaveLength(1);
  });

  it("tüm köşeler geçersizse boş dizi döner", () => {
    const koseler = [
      { lat: 0, lng: 0 },
      { lat: 40.5, lng: 30.5 }, // merkez kopyası
    ];
    expect(gecerliKoseler(merkez, koseler)).toHaveLength(0);
  });

  it("geçerli köşeler korunur", () => {
    const koseler = [
      { lat: 40.4, lng: 30.4 },
      { lat: 40.6, lng: 30.6 },
      { lat: 40.5, lng: 30.7 },
      { lat: 40.3, lng: 30.5 },
    ];
    expect(gecerliKoseler(merkez, koseler)).toHaveLength(4);
  });
});

describe("IDW hesap — spatial-emsal.ts", () => {
  it("boş liste → null", () => {
    expect(idwHesapla([])).toBeNull();
  });

  it("tek eleman — direkt fiyatı döner", () => {
    expect(idwHesapla([{ fiyatPerM2TL: 10000, mesafeM: 500 }])).toBe(10000);
  });

  it("yakın emsal daha fazla ağırlık alır", () => {
    const yakin = { fiyatPerM2TL: 20000, mesafeM: 100 };
    const uzak = { fiyatPerM2TL: 5000, mesafeM: 5000 };
    const sonuc = idwHesapla([yakin, uzak])!;
    // Yakın emsal çok daha ağırlıklı — sonuç 20000'e yakın olmalı
    expect(sonuc).toBeGreaterThan(15000);
  });

  it("eşit mesafe → ağırlıklı ortalama", () => {
    const items = [
      { fiyatPerM2TL: 10000, mesafeM: 1000 },
      { fiyatPerM2TL: 20000, mesafeM: 1000 },
    ];
    // Eşit mesafe → basit ortalama ≈ 15000
    expect(idwHesapla(items)).toBe(15000);
  });

  it("sıfır mesafe → eps korumasıyla çalışır", () => {
    // mesafeM: 0 → eps=1 ile korunur, hata fırlatmaz
    const sonuc = idwHesapla([{ fiyatPerM2TL: 12000, mesafeM: 0 }]);
    expect(sonuc).toBe(12000);
  });

  it("p=2 ile mesafe karesi ters orantı", () => {
    // w1 = 1/100^2 = 1/10000, w2 = 1/200^2 = 1/40000
    // beklenen = (10000/10000 + 5000/40000) / (1/10000 + 1/40000)
    const items = [
      { fiyatPerM2TL: 10000, mesafeM: 100 },
      { fiyatPerM2TL: 5000, mesafeM: 200 },
    ];
    const w1 = 1 / (100 ** 2);
    const w2 = 1 / (200 ** 2);
    const beklenen = Math.round((w1 * 10000 + w2 * 5000) / (w1 + w2));
    expect(idwHesapla(items)).toBe(beklenen);
  });
});
