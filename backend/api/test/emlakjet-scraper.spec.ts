/**
 * Emlakjet parser testleri — Roadmap Sprint B.5.
 *
 * NEDEN BU DOSYA VAR: `lib/emlakjet-scraper.ts` üretimdeki 34 bin ilanın
 * TAMAMINI üreten koddu ve HİÇ testi yoktu. Sonradan yazılan üç parser'ın
 * (zenginleştirme, hepsiemlak, milli emlak) testi vardı; en yük taşıyanın yoktu.
 *
 * Fixture, emlakjet liste sayfasının gerçek JSON-LD biçimini taklit eder.
 * Biçim değişirse bu testler kırılır — sessizce 0 ilan parse etmek yerine.
 *
 * Ayrıca Sprint B.3/B.4 sözleşmeleri burada sabitleniyor:
 *   - "yeni ilan yok" ile "sayfalama bitti" ayrı koşullar
 *   - HTTP durumu çağırana dönüyor; 429/403/503 veri yokluğu DEĞİL
 */
import { describe, it, expect } from "vitest";
import {
  listeJsonLdParse,
  detayParse,
  baslikCikar,
  ilanLinkleriCikar,
  botEngelMi,
} from "../src/lib/emlakjet-scraper.js";

// ── Fixture: liste sayfası ───────────────────────────────────────────────────

function ldScript(obj: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;
}

function listeKaydi(over: Record<string, unknown> = {}) {
  return {
    "@type": "RealEstateListing",
    url: "https://www.emlakjet.com/ilan/catalca-nakkas-satilik-arsa-17472901",
    name: "Çatalca Nakkaş'ta 500 m² Yatırımlık Hisseli Tapu Arsa",
    offers: { "@type": "Offer", price: 1_250_000, priceCurrency: "TRY" },
    additionalProperty: [
      { "@type": "PropertyValue", name: "Metrekare", value: "500 m²" },
      { "@type": "PropertyValue", name: "Konum", value: "Nakkaş Mahallesi, Çatalca" },
      { "@type": "PropertyValue", name: "İlan Tipi", value: "Satılık Arsa" },
    ],
    ...over,
  };
}

function listeSayfasi(kayitlar: unknown[]): string {
  return `<!doctype html><html><head>${ldScript({
    "@context": "https://schema.org",
    "@graph": kayitlar,
  })}</head><body></body></html>`;
}

// ── listeJsonLdParse ─────────────────────────────────────────────────────────

describe("listeJsonLdParse", () => {
  it("gerçek biçimli kayıttan tüm alanları çıkarır", () => {
    const [r] = listeJsonLdParse(listeSayfasi([listeKaydi()]), "arsa");
    expect(r).toBeDefined();
    expect(r!.ejId).toBe("17472901");
    expect(r!.ilceN).toBe("catalca");
    expect(r!.mahN).toBe("nakkas");          // "Mahallesi" eki düşer
    expect(r!.kategori).toBe("arsa");
    expect(r!.m2).toBe(500);
    expect(r!.tlm2).toBe(2500);              // 1.250.000 / 500
  });

  it("BAŞLIĞI yakalar — rafineri NLP'sinin tek metin sinyali", () => {
    // Başlık ingest hattında aylarca düşüyordu: 530 ilanın hiçbirinde yoktu ve
    // hisseli tapu / kooperatif tespiti sinyalsiz çalışıyordu.
    const [r] = listeJsonLdParse(listeSayfasi([listeKaydi()]), "arsa");
    expect(r!.baslik).toContain("Hisseli Tapu");
  });

  it("İlan Tipi hedef kategoriyi EZER (arsa sayfasında tarla ilanı)", () => {
    const html = listeSayfasi([
      listeKaydi({
        additionalProperty: [
          { name: "Metrekare", value: "12.000 m²" },
          { name: "Konum", value: "Kalfa Köyü, Çatalca" },
          { name: "İlan Tipi", value: "Satılık Tarla" },
        ],
      }),
    ]);
    const [r] = listeJsonLdParse(html, "arsa");
    expect(r!.kategori).toBe("tarla");
    expect(r!.m2).toBe(12000);               // binlik ayracı temizlenir
  });

  it("@graph içinde RealEstateListing olmayan düğümleri atlar", () => {
    const html = listeSayfasi([
      { "@type": "WebSite", name: "Emlakjet" },
      { "@type": "BreadcrumbList", itemListElement: [] },
      listeKaydi(),
    ]);
    expect(listeJsonLdParse(html, "arsa")).toHaveLength(1);
  });

  it("bozuk JSON-LD tüm sayfayı düşürmez — sağlam script yine parse edilir", () => {
    const html =
      `<script type="application/ld+json">{ bu json değil </script>` +
      listeSayfasi([listeKaydi()]);
    expect(listeJsonLdParse(html, "arsa")).toHaveLength(1);
  });

  it("eksik/aykırı alanlı kayıtları eler, sağlamı bırakır", () => {
    const html = listeSayfasi([
      listeKaydi({ offers: {} }),                                    // fiyat yok
      listeKaydi({ additionalProperty: [{ name: "Konum", value: "X, Y" }] }), // m2 yok
      listeKaydi({
        additionalProperty: [
          { name: "Metrekare", value: "500 m²" },
          { name: "İlan Tipi", value: "Satılık Arsa" },
        ],
      }),                                                            // konum yok
      listeKaydi({ url: "https://www.emlakjet.com/ilan/kisa-123" }), // id 7 haneden kısa
      listeKaydi({ offers: { price: 100 } }),                        // tlm2 = 0.2 → alt sınır
      listeKaydi(),                                                  // sağlam
    ]);
    const r = listeJsonLdParse(html, "arsa");
    expect(r).toHaveLength(1);
    expect(r[0]!.ejId).toBe("17472901");
  });

  it("JSON-LD hiç yoksa boş dizi döner — çağıran fallback yoluna geçer", () => {
    expect(listeJsonLdParse("<html><body>hiçbir şey</body></html>", "arsa")).toEqual([]);
  });

  it("ilN'i BOŞ bırakır — il bilgisi çağrıdan gelir, JSON-LD'den değil", () => {
    // Sözleşme: emlakjetIlceTara bu alanı override eder. Parser'ın burada
    // tahmin yürütmesi il_norm kaymasına yol açardı.
    const [r] = listeJsonLdParse(listeSayfasi([listeKaydi()]), "arsa");
    expect(r!.ilN).toBe("");
  });
});

// ── detayParse / baslikCikar / ilanLinkleriCikar ─────────────────────────────

const DETAY_HTML = `<!doctype html><html><head>
<title>Çatalca'da Satılık 616 m² Arsa | Emlakjet</title>
<script type="application/ld+json">${JSON.stringify({
  "@type": "Product",
  offers: { price: "1.848.000", priceCurrency: "TRY" },
})}</script>
<script type="application/ld+json">${JSON.stringify({
  "@type": "BreadcrumbList",
  itemListElement: [
    { item: { name: "Anasayfa" } },
    { item: { name: "Satılık Arsa" } },
    { item: { name: "İstanbul" } },
    { item: { name: "Çatalca" } },
    { item: { name: "Nakkaş Mah." } },
  ],
})}</script>
</head><body><h1>Çatalca Nakkaş'ta 616 m² Satılık Arsa</h1>
<div>616 m²</div><div>616 m²</div><div>1.000 m² imar planı</div>
</body></html>`;

describe("detayParse", () => {
  it("breadcrumb + Product'tan il/ilçe/mahalle/fiyat/m2 çıkarır", () => {
    const r = detayParse(DETAY_HTML);
    expect(r.il).toBe("İstanbul");
    expect(r.ilce).toBe("Çatalca");
    expect(r.mahalle).toBe("Nakkaş Mah.");
    expect(r.fiyat).toBe(1_848_000);
    expect(r.kategori).toBe("arsa");
  });

  it("m2'yi EN SIK geçen değerden seçer — sayfadaki diğer m² sayıları değil", () => {
    expect(detayParse(DETAY_HTML).m2).toBe(616);
  });

  it("JSON-LD yoksa alanlar null döner (uydurmaz)", () => {
    const r = detayParse("<html><body>boş</body></html>");
    expect(r.fiyat).toBeNull();
    expect(r.ilce).toBeNull();
    expect(r.m2).toBeNull();
  });
});

describe("baslikCikar", () => {
  it("h1'i <title>'a tercih eder", () => {
    expect(baslikCikar(DETAY_HTML)).toBe("Çatalca Nakkaş'ta 616 m² Satılık Arsa");
  });

  it("h1 yoksa <title>'a düşer", () => {
    expect(baslikCikar("<html><head><title>Satılık Tarla</title></head></html>"))
      .toBe("Satılık Tarla");
  });

  it("ikisi de yoksa null — boş string değil", () => {
    expect(baslikCikar("<html><body>x</body></html>")).toBeNull();
  });
});

describe("ilanLinkleriCikar", () => {
  it("ilan bağlantılarını tekilleştirerek çıkarır", () => {
    const html = `
      <a href="/ilan/catalca-satilik-arsa-17472901">a</a>
      <a href="/ilan/catalca-satilik-arsa-17472901">aynı</a>
      <a href="/ilan/silivri-satilik-tarla-18001234">b</a>
      <a href="/kurumsal/hakkimizda">alakasız</a>`;
    expect(ilanLinkleriCikar(html).sort()).toEqual([
      "/ilan/catalca-satilik-arsa-17472901",
      "/ilan/silivri-satilik-tarla-18001234",
    ]);
  });
});

// ── B.4 sözleşmesi: HTTP durumu yutulmaz ─────────────────────────────────────

describe("botEngelMi — engellenme ile veri yokluğunun ayrımı", () => {
  it("429/403/503 bot engeli sayılır", () => {
    expect(botEngelMi(429)).toBe(true);
    expect(botEngelMi(403)).toBe(true);
    expect(botEngelMi(503)).toBe(true);
  });

  it("404 ve ağ hatası (0) bot engeli DEĞİLDİR", () => {
    // 404 gerçekten "bu ilçe sayfası yok" demek; 0 ise yanıt hiç alınamadı.
    // İkisi de engellenme sayılırsa tarama gereksiz yere durur.
    expect(botEngelMi(404)).toBe(false);
    expect(botEngelMi(0)).toBe(false);
    expect(botEngelMi(200)).toBe(false);
  });
});
