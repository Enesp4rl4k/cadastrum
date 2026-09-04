/**
 * İlçe→mahalle projeksiyon çarpanı (F.2).
 *
 * Bu dosya bir DÜZELTMEYİ değil, bir ÖLÇÜM SONUCUNU koruyor: sabitler
 * sezgiyle yazılmış ve fiilen uygulanmıyorlar, çünkü `mahalleTipiBelirle`
 * mahallelerin %91'ini "sehir" sayıyor. Birisi bu sabitleri "ayarlamaya"
 * kalkarsa, önce sınıflandırıcının kırık olduğunu görmeli.
 */
import { describe, it, expect } from "vitest";
import { mahalleTipiBelirle, ilceFallbackCarpani } from "../src/lib/data/ilce-baseline";

describe("mahalleTipiBelirle — bilinen körlük", () => {
  it("adında 'köy' geçen mahalleyi köy sayar", () => {
    expect(mahalleTipiBelirle("Karaköy")).toBe("koy");
    expect(mahalleTipiBelirle("Aşağı Bucak")).toBe("koy");
  });

  it("mezra/yayla adlarını hamlet sayar", () => {
    expect(mahalleTipiBelirle("Ilıca Yaylası")).toBe("hamlet");
  });

  /**
   * BİLİNEN KUSUR — düzeltme değil, belge. Gerçek bir köy olan "Yeşilyurt"
   * adında "köy" geçmediği için şehir sayılıyor ve çarpan 1.00 alıyor.
   * Kanonik listedeki 67.647 mahallenin 61.703'ü (%91) bu durumda.
   */
  it("adında ipucu olmayan köyü ŞEHİR sayar (kusur, kasten belgeli)", () => {
    expect(mahalleTipiBelirle("Yeşilyurt")).toBe("sehir");
    expect(mahalleTipiBelirle("Çamlıca")).toBe("sehir");
  });

  it("boş ad şehir varsayılır", () => {
    expect(mahalleTipiBelirle(null)).toBe("sehir");
  });
});

describe("ilceFallbackCarpani", () => {
  it("şehir ilçe medyanına eşitlenir", () => {
    expect(ilceFallbackCarpani("sehir", "arsa")).toBe(1.0);
    expect(ilceFallbackCarpani("sehir", "tarla")).toBe(1.0);
  });

  it("kırsal iskonto şehirden düşük", () => {
    expect(ilceFallbackCarpani("koy", "arsa")).toBeLessThan(1.0);
    expect(ilceFallbackCarpani("hamlet", "arsa")).toBeLessThan(
      ilceFallbackCarpani("koy", "arsa"),
    );
  });

  it("tarlada iskonto arsadan yumuşak (tarım değeri konuma daha az bağlı)", () => {
    expect(ilceFallbackCarpani("koy", "tarla")).toBeGreaterThan(
      ilceFallbackCarpani("koy", "arsa"),
    );
  });
});
