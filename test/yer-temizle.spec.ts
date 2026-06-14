/**
 * Yer adı temizleme testleri — Sahibinden/Hepsiemlak parser bug'larını
 * regression olarak yakalar.
 */
import { describe, it, expect } from "vitest";
import {
  ilTemizle,
  ilceTemizle,
  mahalleTemizle,
  ilIlceAyir,
  yerAdıGeçerliMi,
  yerTemizleVeDogrula,
} from "../src/lib/yer-temizle";

describe("ilTemizle", () => {
  it("parantez ekini siler: 'Yeniçiftlik(Sahil)' → 'Yeniçiftlik'", () => {
    expect(ilTemizle("Yeniçiftlik(Sahil)")).toBe("Yeniçiftlik");
  });

  it("'İSTANBUL' → 'İstanbul' (Title Case)", () => {
    expect(ilTemizle("İSTANBUL")).toBe("İstanbul");
  });

  it("'istanbul' → 'İstanbul'", () => {
    expect(ilTemizle("istanbul")).toBe("İstanbul");
  });

  it("'Konya' aynı kalır", () => {
    expect(ilTemizle("Konya")).toBe("Konya");
  });

  it("boş veya null", () => {
    expect(ilTemizle(null)).toBe(null);
    expect(ilTemizle("")).toBe(null);
    expect(ilTemizle("  ")).toBe(null);
  });
});

describe("ilceTemizle", () => {
  it("parantez ekini siler: 'Marmara Ereğlisi (Merkez)' → 'Marmara Ereğlisi'", () => {
    expect(ilceTemizle("Marmara Ereğlisi (Merkez)")).toBe("Marmara Ereğlisi");
  });

  it("'Meram' aynı kalır", () => {
    expect(ilceTemizle("Meram")).toBe("Meram");
  });
});

describe("mahalleTemizle", () => {
  it("'Mh.' suffix'ini siler: 'Yeniçiftlik Mh.' → 'Yeniçiftlik'", () => {
    expect(mahalleTemizle("Yeniçiftlik Mh.")).toBe("Yeniçiftlik");
  });

  it("'Mahallesi' suffix'i: 'Beşiktaş Mahallesi' → 'Beşiktaş'", () => {
    expect(mahalleTemizle("Beşiktaş Mahallesi")).toBe("Beşiktaş");
  });

  it("'Köyü' suffix'i: 'Tuzkoy Köyü' → 'Tuzkoy'", () => {
    expect(mahalleTemizle("Tuzkoy Köyü")).toBe("Tuzkoy");
  });

  it("parantez + suffix: 'Yeniçiftlik(Sahil) Mh.' → 'Yeniçiftlik'", () => {
    expect(mahalleTemizle("Yeniçiftlik(Sahil) Mh.")).toBe("Yeniçiftlik");
  });

  it("suffix yoksa aynı kalır: 'Çukurçimen' → 'Çukurçimen'", () => {
    expect(mahalleTemizle("Çukurçimen")).toBe("Çukurçimen");
  });
});

describe("ilIlceAyir", () => {
  it("'Konya/Meram' → il + ilce", () => {
    expect(ilIlceAyir("Konya/Meram")).toEqual({ il: "Konya", ilce: "Meram" });
  });

  it("'Tekirdağ - Marmara Ereğlisi' → ayrım", () => {
    expect(ilIlceAyir("Tekirdağ - Marmara Ereğlisi")).toEqual({
      il: "Tekirdağ",
      ilce: "Marmara Ereğlisi",
    });
  });

  it("Tek değer (sadece il)", () => {
    expect(ilIlceAyir("Konya")).toEqual({ il: "Konya", ilce: null });
  });

  it("Boş", () => {
    expect(ilIlceAyir(null)).toEqual({ il: null, ilce: null });
    expect(ilIlceAyir("")).toEqual({ il: null, ilce: null });
  });
});

describe("yerAdıGeçerliMi", () => {
  it("Geçerli yer adları", () => {
    expect(yerAdıGeçerliMi("Konya")).toBe(true);
    expect(yerAdıGeçerliMi("Marmara Ereğlisi")).toBe(true);
    expect(yerAdıGeçerliMi("Beşiktaş")).toBe(true);
    expect(yerAdıGeçerliMi("Yeniçiftlik")).toBe(true);
  });

  it("Kategorik başlıklar reddedilir", () => {
    expect(yerAdıGeçerliMi("Arsa")).toBe(false);
    expect(yerAdıGeçerliMi("Tarla")).toBe(false);
    expect(yerAdıGeçerliMi("Anasayfa")).toBe(false);
    expect(yerAdıGeçerliMi("Emlak")).toBe(false);
    expect(yerAdıGeçerliMi("Satılık")).toBe(false);
  });

  it("Çok kısa veya çok uzun reddedilir", () => {
    expect(yerAdıGeçerliMi("A")).toBe(false);
    expect(yerAdıGeçerliMi("a".repeat(70))).toBe(false);
  });

  it("Sayı ile başlayan reddedilir", () => {
    expect(yerAdıGeçerliMi("1907")).toBe(false);
    expect(yerAdıGeçerliMi("4. mahalle")).toBe(false);
  });

  it("null/empty reddedilir", () => {
    expect(yerAdıGeçerliMi(null)).toBe(false);
    expect(yerAdıGeçerliMi("")).toBe(false);
    expect(yerAdıGeçerliMi("   ")).toBe(false);
  });
});

describe("yerTemizleVeDogrula (full pipeline)", () => {
  it("Senaryo: Sahibinden 4-elementli breadcrumb → mahalle düzgün", () => {
    // Tekirdağ > Marmaraereğlisi > Yeniçiftlik(Sahil) > Yeniçiftlik Mh.
    expect(yerTemizleVeDogrula("Tekirdağ", "il")).toBe("Tekirdağ");
    expect(yerTemizleVeDogrula("Marmaraereğlisi", "ilce")).toBe("Marmaraereğlisi");
    expect(yerTemizleVeDogrula("Yeniçiftlik(Sahil)", "mahalle")).toBe("Yeniçiftlik");
    expect(yerTemizleVeDogrula("Yeniçiftlik Mh.", "mahalle")).toBe("Yeniçiftlik");
  });

  it("Senaryo: ALL CAPS il", () => {
    expect(yerTemizleVeDogrula("İSTANBUL", "il")).toBe("İstanbul");
  });

  it("Senaryo: kategorik değer reddedilir", () => {
    expect(yerTemizleVeDogrula("Arsa", "il")).toBe(null);
    expect(yerTemizleVeDogrula("Satılık", "ilce")).toBe(null);
  });
});
