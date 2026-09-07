/**
 * KALİBRE ARALIK — "gösterdiğimiz aralık gerçekten ne kadarını kapsıyor?"
 *
 * Motorun aralığı elle ayarlı katsayılardan geliyordu ve kapsaması hiç
 * ölçülmemişti. Ölçüldü (2026-09-07, hold-out): arsa **%17,7**. Yani
 * kullanıcıya gösterilen aralık gerçek fiyatı 6 vakadan 5'inde kaçırıyordu.
 *
 * Daha ters bir şey de çıktı: genişlik güvenle TERS orantılıydı — en iyi
 * katman en dar aralığa sahipti (%19) ve en az kapsıyordu (%15). Genişlik
 * "ne kadar eminiz"e göre ayarlanmıştı, "ne kadar yanılıyoruz"a göre değil.
 *
 * Kalibrasyondan sonra: arsa %49,9 · tarla %50,5 (hedef %50).
 *
 * Bu dosya davranış sözleşmesini kilitliyor. Asıl kapsama ölçümü backtest'te
 * (`aralık kapsamasını raporlar`); burada tablodan aralığa dönüşümün
 * kuralları test ediliyor.
 */
import { describe, it, expect } from "vitest";
import {
  kalibreAralik,
  VARSAYILAN_ARALIK_SEVIYESI,
} from "../src/lib/fiyat/aralik-kalibrasyon";
import { ARALIK_KALIBRASYONU } from "../src/lib/fiyat/aralik-kalibrasyon-tablosu";
import { guvenSkoruTavani } from "../src/lib/fiyat-tahmin";

describe("kalibre aralık", () => {
  it("ölçülmüş katman için aralık üretir", () => {
    const a = kalibreAralik(5000, "arsa", "ilanGozlem-mahalle");
    expect(a).not.toBeNull();
    expect(a!.altPerM2).toBeLessThan(5000);
    expect(a!.ustPerM2).toBeGreaterThan(5000);
    expect(a!.n).toBeGreaterThanOrEqual(100);
  });

  /**
   * ASIL KORUNAN KURAL: örneklemi yetersiz katman için tablo YOK ve motor
   * eski davranışta kalmalı. 38 kayıttan kantil çıkarmak, ölçüm görüntüsü
   * altında uydurma yapmaktır — bu projede tam olarak ayıkladığımız şey.
   */
  it("ölçülmemiş katman için null döner — uydurmaz", () => {
    expect(kalibreAralik(5000, "arsa", "mahalle-baseline")).toBeNull();
    expect(kalibreAralik(5000, "arsa", "fallback")).toBeNull();
    expect(kalibreAralik(5000, "konut", "ilanGozlem-mahalle")).toBeNull();
  });

  it("tablodaki her kayıt en az 100 gözleme dayanıyor", () => {
    for (const segment of Object.keys(ARALIK_KALIBRASYONU)) {
      for (const [kaynak, k] of Object.entries(ARALIK_KALIBRASYONU[segment]!)) {
        expect(k.n, `${segment}/${kaynak}`).toBeGreaterThanOrEqual(100);
      }
    }
  });

  it("kantiller sıralı — q10 ≤ q25 ≤ q50 ≤ q75 ≤ q90", () => {
    for (const segment of Object.keys(ARALIK_KALIBRASYONU)) {
      for (const [kaynak, k] of Object.entries(ARALIK_KALIBRASYONU[segment]!)) {
        const etiket = `${segment}/${kaynak}`;
        expect(k.q10, etiket).toBeLessThanOrEqual(k.q25);
        expect(k.q25, etiket).toBeLessThanOrEqual(k.q50);
        expect(k.q50, etiket).toBeLessThanOrEqual(k.q75);
        expect(k.q75, etiket).toBeLessThanOrEqual(k.q90);
      }
    }
  });

  /** %80 aralık %50'den geniş olmalı — aksi hâlde kantiller karışmış demektir. */
  it("%80 aralık %50'den geniş", () => {
    const dar = kalibreAralik(5000, "arsa", "ilanGozlem-mahalle", "50")!;
    const genis = kalibreAralik(5000, "arsa", "ilanGozlem-mahalle", "80")!;
    expect(genis.altPerM2).toBeLessThan(dar.altPerM2);
    expect(genis.ustPerM2).toBeGreaterThan(dar.ustPerM2);
  });

  it("varsayılan seviye %50 — ürün kararı, gerekçe dosya başında", () => {
    expect(VARSAYILAN_ARALIK_SEVIYESI).toBe("50");
    const varsayilan = kalibreAralik(5000, "arsa", "ilanGozlem-mahalle");
    const acik = kalibreAralik(5000, "arsa", "ilanGozlem-mahalle", "50");
    expect(varsayilan).toEqual(acik);
  });

  it("geçersiz fiyat null döner", () => {
    expect(kalibreAralik(0, "arsa", "ilanGozlem-mahalle")).toBeNull();
    expect(kalibreAralik(-5, "arsa", "ilanGozlem-mahalle")).toBeNull();
  });

  /**
   * Medyan sapma, katmandaki SİSTEMATİK kaymayı taşıyor ve açıklama
   * katmanının söyleyecek şeyi. 1'den çok uzaklaşırsa kalibrasyon eskimiş
   * demektir — bu bir alarm eşiği, keyfi bir sınır değil.
   */
  it("medyan sapma makul bantta — eskime alarmı", () => {
    for (const segment of Object.keys(ARALIK_KALIBRASYONU)) {
      for (const [kaynak, k] of Object.entries(ARALIK_KALIBRASYONU[segment]!)) {
        expect(k.q50, `${segment}/${kaynak} medyan sapma`).toBeGreaterThan(0.5);
        expect(k.q50, `${segment}/${kaynak} medyan sapma`).toBeLessThan(2.0);
      }
    }
  });
});

/**
 * KONUT — plan yazılırken varsayılan, ölçümle ÇÜRÜTÜLEN madde.
 *
 * GELISTIRME-PLANI-2 §2 "motor konut tahmini üretiyor ama hiç ölçülmüyor"
 * diyordu. Yanlıştı: `bolge-baseline.ts` kategoriyi `isTarimsal ? "tarla" :
 * "arsa"` ile belirliyor — üçüncü dal yok. `SEGMENT_INDEX` ve
 * `MAHALLE_BASELINE` konut kolonu taşıyor ama fiyat motoru onu asla seçmiyor.
 * Bu, `guvenSkoruTavani`'ne konut dalı eklerken tsc tarafından yakalandı
 * ("types 'arsa' | 'tarla' and 'konut' have no overlap").
 *
 * GERÇEK BULGU DAHA CİDDİ ve ayrı bir iş kalemi: bir MESKEN/BİNA parseli
 * "arsa" sayılıyor ve `nitelikCarpani` ona 2,5× uyguluyor. O zincir hiç
 * ölçülmedi — backtest yalnızca arsa/tarla ilanları içeriyor.
 * data/o2-konut-kategorisi-olcum.json
 */
describe("kategori sözleşmesi", () => {
  it("motor yalnızca iki kategori üretiyor — konut dalı YOK", () => {
    // Tip düzeyinde de korunuyor; bu test niyeti kaydediyor.
    expect(guvenSkoruTavani("ilanGozlem-mahalle", "arsa")).toBe(98);
    expect(guvenSkoruTavani("ilanGozlem-mahalle", "tarla")).toBe(98);
  });

  it("ölçülmüş kategorilerin tavanları ölçüme bağlı kalıyor", () => {
    expect(guvenSkoruTavani("mahalle-baseline", "arsa")).toBe(45);
    expect(guvenSkoruTavani("mahalle-baseline", "tarla")).toBe(78);
    expect(guvenSkoruTavani("ilanGozlem-ilce", "arsa")).toBe(88);
  });
});
