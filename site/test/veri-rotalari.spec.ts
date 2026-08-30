/**
 * SÖZLEŞME TESTİ — /veri rotaları ile sitemap'in vaat ettiği URL'ler örtüşüyor mu.
 *
 * NEDEN: canlıda sitemap 181 URL bildiriyordu ve bunların 90'ı (yarısı) için
 * HİÇBİR sayfa üretilmiyordu. `public/_redirects` içindeki
 * `/veri/* → /veri/detay/index.html 200!` kuralı Netlify sözdizimi; Cloudflare
 * Pages'te çalışmıyor. İstek 404 fallback'ine düşüyor, 404.html de olmadığı için
 * kullanıcıya HTTP 200 ile ANASAYFA dönüyordu:
 *
 *     GET /veri/istanbul/catalca        → 200, <title>Cadastrum — TKGM Parsel…
 *     GET /veri/istanbul/besiktas/bebek → 200, aynı anasayfa
 *     GET /veri/uydurma-il              → 200, aynı anasayfa
 *
 * "200 döndü" bunu her izleme aracına sağlıklı gösterdi. Bu test, üretilen
 * sayfa kümesi ile bildirilen URL kümesini birbirine bağlıyor.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ILCELER, tumIlceler, ilceAdi } from "../src/data/ilceler.ts";
import { TOP_MAHALLELER, topMahalleParcalari } from "../src/data/top-mahalleler.ts";

const KOK = process.cwd();

describe("ilçe listesi", () => {
  it("81 il ve ~973 ilçe içeriyor", () => {
    // Liste boşalırsa ilçe sayfaları sessizce üretilmez ve sitemap'in vaat
    // ettiği URL'ler yine 404 olur. Alt sınır bunu yakalar.
    expect(Object.keys(ILCELER).length).toBe(81);
    expect(tumIlceler().length).toBeGreaterThan(900);
  });

  it("her slug URL-güvenli — boşluk yok", () => {
    // Kaynak listede 52 ilçe normunda BOŞLUK var ("adiyaman merkez",
    // "19 mayis"). Slug'a çevrilmeden URL'e konursa bağlantılar kırılır.
    for (const { il, ilce, ad } of tumIlceler()) {
      expect(il).toMatch(/^[a-z0-9-]+$/);
      expect(ilce).toMatch(/^[a-z0-9-]+$/);
      expect(ad.length).toBeGreaterThan(1);
    }
  });

  it("merkez ilçeler il ön eki OLMADAN — API ve site bağlantılarıyla aynı", () => {
    // Ölçüm: API `/fiyat/toplu-ilce-ozet/adiyaman` → ilce_norm "merkez".
    // Kaynak liste ise "adiyaman merkez" diyor. Site'ın kendi ilçe bağlantıları
    // API'den üretildiği için kanonik biçim API'ninki; ön ek atılmazsa üretilen
    // sayfa ile bağlanılan URL farklı olur ve 13 il merkezinde link kırılır.
    const merkez = ILCELER["adiyaman"]!.find((k) => k.ad === "Adıyaman Merkez");
    expect(merkez?.norm).toBe("merkez");
    expect(merkez?.apiNorm).toBe("merkez");
  });

  it("gerçek çok kelimeli ilçe tireleniyor, API biçimi korunuyor", () => {
    const m = ILCELER["samsun"]!.find((k) => k.norm === "19-mayis");
    expect(m).toBeDefined();
    expect(m!.apiNorm).toBe("19 mayis");   // D1'de boşlukla duruyor
  });

  it("görünen ad Türkçe karakterleri koruyor", () => {
    expect(ilceAdi("istanbul", "catalca")).toBe("Çatalca");
  });

  it("bilinmeyen ilçe için ad uydurmuyor, slug'ı başlıklandırıyor", () => {
    // Türkçe büyütme: "ilce" → "İlce" (locale-aware toLocaleUpperCase("tr")).
    expect(ilceAdi("istanbul", "olmayan-ilce")).toBe("Olmayan İlce");
  });
});

describe("sitemap ↔ üretilen sayfa kümesi", () => {
  it("mahalle listesi TEK kaynaktan okunuyor (sitemap ve sayfa üretimi aynı)", () => {
    // Eskiden liste yalnızca sitemap.xml.ts içindeydi; sayfa üreten hiçbir yer
    // ona bakmıyordu. Ortak dosyaya alındı — bu test o bağı sabitliyor.
    const sitemapKaynak = readFileSync(
      join(KOK, "src", "pages", "sitemap.xml.ts"),
      "utf8",
    );
    expect(sitemapKaynak).toContain("data/top-mahalleler");
    expect(topMahalleParcalari().length).toBe(TOP_MAHALLELER.length);
    expect(TOP_MAHALLELER.length).toBeGreaterThan(50);
  });

  it("sitemap'teki her mahalle URL'i il/ilçe/mahalle biçiminde", () => {
    for (const k of TOP_MAHALLELER) {
      expect(k.split("__")).toHaveLength(3);
    }
  });

  it("curated mahallelerin ili ve ilçesi ilçe listesinde gerçekten var", () => {
    // Yazım hatası olan bir kayıt, sayfası üretilse bile veri çekemez.
    const bilinmeyen = topMahalleParcalari().filter(
      ({ il, ilce }) => !ILCELER[il]?.some((k) => k.norm === ilce),
    );
    expect(bilinmeyen).toEqual([]);
  });
});

describe("harita statik varlıkları", () => {
  it("otoyollar.geojson VAR ve dolu", () => {
    // Bu dosya depoda hiç yoktu; harita düğmesi ona fetch atıyordu. Cloudflare
    // Pages eşleşmeyen yola anasayfayı sunduğu için istek 200 dönüyor,
    // res.json() HTML'de patlıyor ve hata mesajı anında siliniyordu.
    const p = join(KOK, "public", "geo", "otoyollar.geojson");
    expect(existsSync(p)).toBe(true);

    const g = JSON.parse(readFileSync(p, "utf8")) as {
      type: string;
      features: Array<{ properties: { tip: string; ad: string }; geometry: { coordinates: number[] } }>;
    };
    expect(g.type).toBe("FeatureCollection");
    expect(g.features.length).toBeGreaterThan(5000);
  });

  it("otoyol feature'ları katmanın beklediği alanları taşıyor", () => {
    // Katman `filter: ["==", ["get","tip"], "motorway"]` ve `text-field: ad`
    // kullanıyor; alan adları değişirse katman sessizce boş çizer.
    const g = JSON.parse(
      readFileSync(join(KOK, "public", "geo", "otoyollar.geojson"), "utf8"),
    ) as { features: Array<{ properties: { tip: string; ad: string }; geometry: { coordinates: number[] } }> };

    const f = g.features[0]!;
    expect(f.properties.tip).toBe("motorway");
    expect(typeof f.properties.ad).toBe("string");

    // GeoJSON sırası [lng, lat] — ters yazılırsa noktalar Somali açıklarına düşer.
    const [lng, lat] = f.geometry.coordinates as [number, number];
    expect(lat).toBeGreaterThan(35);
    expect(lat).toBeLessThan(43);
    expect(lng).toBeGreaterThan(25);
    expect(lng).toBeLessThan(46);
  });

  it("POI dosyası da yerinde", () => {
    expect(existsSync(join(KOK, "public", "geo", "poi-katmanlari.json"))).toBe(true);
  });
});

describe("_redirects", () => {
  it("çalışmayan Netlify SPA kuralı geri gelmemiş", () => {
    const r = readFileSync(join(KOK, "public", "_redirects"), "utf8");
    // Yorum satırlarını at — kuralın kendisi geri gelmiş mi ona bakıyoruz.
    const kurallar = r
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
    expect(kurallar.some((l) => l.startsWith("/veri/*"))).toBe(false);
  });
});

describe("rota dosyaları yerinde", () => {
  const ROTALAR = [
    "src/pages/veri/[il].astro",
    "src/pages/veri/[il]/[ilce].astro",
    "src/pages/veri/[il]/[ilce]/[mahalle].astro",
    "src/pages/veri/detay.astro",
    "src/pages/404.astro",
  ];

  for (const yol of ROTALAR) {
    it(`${yol} var`, () => {
      expect(existsSync(join(KOK, yol))).toBe(true);
    });
  }

  it("404.astro gerçekten var — yoksa Cloudflare Pages anasayfayı sunar", () => {
    const s = readFileSync(join(KOK, "src", "pages", "404.astro"), "utf8");
    expect(s).toContain("robots=");
  });
});

describe("build çıktısı (yalnızca dist varsa)", () => {
  const dist = join(KOK, "dist");
  const varMi = existsSync(dist);

  it.skipIf(!varMi)("örnek ilçe sayfası anasayfa DEĞİL", () => {
    const p = join(dist, "veri", "istanbul", "catalca", "index.html");
    expect(existsSync(p)).toBe(true);
    const html = readFileSync(p, "utf8");
    const baslik = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? "";
    expect(baslik).toContain("Çatalca");
    // Regresyonun imzası: anasayfa başlığı.
    expect(baslik).not.toContain("Chrome Eklentisi");
  });

  it.skipIf(!varMi)("örnek mahalle sayfası anasayfa DEĞİL", () => {
    const p = join(dist, "veri", "istanbul", "besiktas", "bebek", "index.html");
    expect(existsSync(p)).toBe(true);
    const baslik = /<title>([^<]*)<\/title>/.exec(readFileSync(p, "utf8"))?.[1] ?? "";
    expect(baslik).toContain("Bebek");
    expect(baslik).not.toContain("Chrome Eklentisi");
  });

  it.skipIf(!varMi)("sitemap'in bildirdiği her mahalle URL'inin dosyası üretilmiş", () => {
    for (const { il, ilce, mahalle } of topMahalleParcalari()) {
      const p = join(dist, "veri", il, ilce, mahalle, "index.html");
      expect(existsSync(p), `${il}/${ilce}/${mahalle} üretilmemiş`).toBe(true);
    }
  });
});
