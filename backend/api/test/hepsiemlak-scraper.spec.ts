/**
 * Hepsiemlak parser testleri — gerçek liste sayfası JSON-LD biçimine karşı.
 *
 * Fixture canlı bir sayfadan (/catalca-satilik/arsa) alınmış gerçek bir
 * kayıttır; biçim değişirse bu testler kırılır ve sessiz veri kaybı yerine
 * görünür hata alırız.
 */
import { describe, it, expect } from "vitest";
import {
  ilanUrlParse,
  adresParse,
  listeJsonLdCikar,
  ilanNormalize,
  normalizeTr,
} from "../src/lib/hepsiemlak-scraper.js";

// Canlı sayfadan alınmış gerçek kayıt
const GERCEK = {
  "@type": "RealEstateListing",
  url: "https://www.hepsiemlak.com/istanbul-catalca-nakkas-satilik/tarla/167147-415",
  name: "Çatalca Nakkaş Kolviran'da 456 metrekare Satılık Arsa",
  about: {
    address: { addressLocality: "İstanbul", streetAddress: "Nakkaş, Çatalca/İstanbul" },
    additionalProperty: [{ "@type": "PropertyValue", name: "Net Alan", value: 456, unitCode: "MTK" }],
  },
  offers: { "@type": "Offer", price: 2300000, priceCurrency: "TRY" },
};

describe("ilanUrlParse", () => {
  it("gerçek URL den mahalle, kategori ve ilan no çıkarır", () => {
    const r = ilanUrlParse(GERCEK.url, "istanbul", "catalca")!;
    expect(r.ilanNo).toBe("he_167147-415");
    expect(r.mahN).toBe("nakkas");
    expect(r.kategori).toBe("tarla");
    expect(r.imarDurumu).toBe("Tarla");
  });

  it("imarli-* slug larından imar durumunu türetir", () => {
    // ÖLÇÜM: düz "arsa" slug u hiç yok; arsa tarafı imarli-konut,
    // imarli-sanayi gibi slug larla geliyor ve imar durumunu bedavaya veriyor.
    const k = ilanUrlParse("https://www.hepsiemlak.com/x-y-z-satilik/imarli-konut/1-2", "x", "y")!;
    expect(k.kategori).toBe("arsa");
    expect(k.imarDurumu).toBe("Konut İmarlı");

    const sanayi = ilanUrlParse("https://www.hepsiemlak.com/x-y-z-satilik/imarli-sanayi/1-2", "x", "y")!;
    expect(sanayi.kategori).toBe("arsa");
    expect(sanayi.imarDurumu).toBe("Sanayi İmarlı");
  });

  it("tarımsal alt tipleri tarla kategorisine eşler", () => {
    for (const [slug, imar] of [["bahce", "Bahçe"], ["zeytinlik", "Zeytinlik"], ["bag", "Bağ"]]) {
      const r = ilanUrlParse(`https://www.hepsiemlak.com/x-y-z-satilik/${slug}/1-2`, "x", "y")!;
      expect(r.kategori).toBe("tarla");
      expect(r.imarDurumu).toBe(imar);
    }
  });

  it("çok tireli mahalle adını bozmadan çıkarır", () => {
    const r = ilanUrlParse(
      "https://www.hepsiemlak.com/ankara-cubuk-yeni-mahalle-satilik/arsa/1-2",
      "ankara", "cubuk",
    )!;
    expect(r.mahN).toBe("yeni-mahalle");
  });

  it("mahalle yoksa (sadece il-ilce) null döner", () => {
    const r = ilanUrlParse(
      "https://www.hepsiemlak.com/istanbul-catalca-satilik/arsa/9-9",
      "istanbul", "catalca",
    )!;
    expect(r.mahN).toBeNull();
  });

  it("arazi olmayan / belirsiz kategorileri eler", () => {
    expect(ilanUrlParse("https://www.hepsiemlak.com/x-satilik/daire/1-2", "x", "y")).toBeNull();
    // ozel-kullanim: ne olduğu belirsiz, yanlış kategoriye koymak havuzu kirletir
    expect(ilanUrlParse("https://www.hepsiemlak.com/x-satilik/ozel-kullanim/1-2", "x", "y")).toBeNull();
  });

  it("biçimsiz URL de null döner", () => {
    expect(ilanUrlParse("https://www.hepsiemlak.com/", "x", "y")).toBeNull();
  });
});

describe("adresParse", () => {
  it("gerçek adres biçimini ayrıştırır", () => {
    expect(adresParse("Nakkaş, Çatalca/İstanbul")).toEqual({
      mahalle: "Nakkaş", ilce: "Çatalca", il: "İstanbul",
    });
  });
  it("boş girdide hepsini null döner", () => {
    expect(adresParse(null)).toEqual({ mahalle: null, ilce: null, il: null });
  });
});

describe("normalizeTr", () => {
  it("Türkçe karakterleri ve boşlukları slug a çevirir", () => {
    expect(normalizeTr("Nakkaş Köyü")).toBe("nakkas-koyu");
    expect(normalizeTr("Çatalca")).toBe("catalca");
  });
});

describe("listeJsonLdCikar", () => {
  it("ItemList içindeki ilanları çıkarır", () => {
    const html = `<html><script type="application/ld+json">${JSON.stringify({
      "@type": "ItemList",
      numberOfItems: 451,
      itemListElement: [{ "@type": "ListItem", position: 1, item: GERCEK }],
    })}</script></html>`;
    const r = listeJsonLdCikar(html);
    expect(r).toHaveLength(1);
    expect(r[0]!.url).toBe(GERCEK.url);
  });

  it("ItemList olmayan ld+json bloklarını atlar", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({ "@type": "BreadcrumbList" })}</script>`;
    expect(listeJsonLdCikar(html)).toEqual([]);
  });

  it("bozuk JSON de çökmez", () => {
    expect(listeJsonLdCikar(`<script type="application/ld+json">{bozuk</script>`)).toEqual([]);
  });
});

describe("ilanNormalize", () => {
  it("gerçek kaydı doğru normalize eder", () => {
    const r = ilanNormalize(GERCEK, "istanbul", "catalca")!;
    expect(r.ilanNo).toBe("he_167147-415");
    expect(r.ilN).toBe("istanbul");
    expect(r.ilceN).toBe("catalca");
    expect(r.mahN).toBe("nakkas");
    expect(r.kategori).toBe("tarla");
    expect(r.m2).toBe(456);
    expect(r.tlm2).toBe(Math.round(2300000 / 456)); // 5044
    expect(r.baslik).toContain("Çatalca Nakkaş");
  });

  it("TRY dışı para birimini eler (kur dönüşümü bu katmanın işi değil)", () => {
    expect(ilanNormalize(
      { ...GERCEK, offers: { price: 100000, priceCurrency: "USD" } },
      "istanbul", "catalca",
    )).toBeNull();
  });

  it("m² yoksa veya 50 altındaysa eler", () => {
    expect(ilanNormalize(
      { ...GERCEK, about: { ...GERCEK.about, additionalProperty: [] } },
      "istanbul", "catalca",
    )).toBeNull();
    expect(ilanNormalize(
      { ...GERCEK, about: { ...GERCEK.about, additionalProperty: [{ name: "Net Alan", value: 10, unitCode: "MTK" }] } },
      "istanbul", "catalca",
    )).toBeNull();
  });

  it("MTK olmayan birimi eler (m² olduğuna güvenemeyiz)", () => {
    expect(ilanNormalize(
      { ...GERCEK, about: { ...GERCEK.about, additionalProperty: [{ name: "Net Alan", value: 500, unitCode: "HAR" }] } },
      "istanbul", "catalca",
    )).toBeNull();
  });

  it("akıl dışı TL/m² değerlerini eler", () => {
    // 456 m² için 100 TL → 0 TL/m²
    expect(ilanNormalize(
      { ...GERCEK, offers: { price: 100, priceCurrency: "TRY" } },
      "istanbul", "catalca",
    )).toBeNull();
  });

  it("fiyat yoksa eler", () => {
    expect(ilanNormalize({ ...GERCEK, offers: undefined }, "istanbul", "catalca")).toBeNull();
  });

  it("URL de mahalle yoksa adresten türetir", () => {
    const r = ilanNormalize(
      { ...GERCEK, url: "https://www.hepsiemlak.com/istanbul-catalca-satilik/arsa/1-2" },
      "istanbul", "catalca",
    )!;
    expect(r.mahN).toBe("nakkas"); // streetAddress "Nakkaş, ..." ten
  });
});
