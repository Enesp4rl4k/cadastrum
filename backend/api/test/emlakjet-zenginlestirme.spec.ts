/**
 * Zenginleştirme parser testleri — gerçek emlakjet detay sayfası biçimine karşı.
 *
 * Fixture'lar canlı bir ilan sayfasından (19780846) alınmış gerçek parçalardır;
 * biçim değişirse bu testler kırılır ve sessiz veri kaybı yerine görünür hata alırız.
 */
import { describe, it, expect } from "vitest";
import {
  imarDurumuCikar,
  tapuDurumuCikar,
  parselKoordinatCikar,
  baslikCikar,
  detaySayfasiParse,
} from "../src/lib/emlakjet-zenginlestirme.js";

// Gerçek sayfadan alınmış JSON-LD parçası
const JSONLD = `{"@type":"PropertyValue","name":"Kategori","value":"Satılık Tarla"},{"@type":"PropertyValue","name":"Krediye Uygunluk","value":"Bilinmiyor"},{"@type":"PropertyValue","name":"İmar Durumu","value":"Tarla"},{"@type":"PropertyValue","name":"Kat Karşılığı","value":"Verilebilir"}`;

// Gerçek sayfadan alınmış, kaçışlı gömülü JSON parçası
const GEOMETRY = `\\"groundStatus\\":\\"Ana Taşınmaz\\",\\"geometry\\":{\\"coordinates\\":[[[28.02112,41.1186],[28.02127,41.11853],[28.02138,41.11849],[28.02100,41.11870]]]}`;

// Gerçek sayfadan alınmış HTML parçası — değer ÖNCE, etiket SONRA
const TAPU = `<p class="text-sm text-(--color-fg-default)">Hisseli Tapu</p><p class="text-xs leading-tight text-(--color-fg-default)">Tapu Durumu</p>`;

describe("imarDurumuCikar", () => {
  it("JSON-LD PropertyValue'dan imar durumunu çıkarır", () => {
    expect(imarDurumuCikar(JSONLD)).toBe("Tarla");
  });
  it("'Bilinmiyor' değerini veri saymaz", () => {
    expect(imarDurumuCikar(`"name":"İmar Durumu","value":"Bilinmiyor"`)).toBeNull();
  });
  it("alan yoksa null döner", () => {
    expect(imarDurumuCikar("<html>bos</html>")).toBeNull();
  });
});

describe("tapuDurumuCikar", () => {
  it("etiketin ÖNCESİNDEKİ değeri alır", () => {
    expect(tapuDurumuCikar(TAPU)).toBe("Hisseli Tapu");
  });
  it("alan yoksa null döner", () => {
    expect(tapuDurumuCikar("<html>bos</html>")).toBeNull();
  });
});

describe("parselKoordinatCikar", () => {
  it("kaçışlı gömülü JSON'daki poligondan centroid üretir", () => {
    const k = parselKoordinatCikar(GEOMETRY);
    expect(k).not.toBeNull();
    // Poligon Silivri civarı — centroid de orada olmalı
    expect(k!.lat).toBeGreaterThan(41.11);
    expect(k!.lat).toBeLessThan(41.12);
    expect(k!.lng).toBeGreaterThan(28.02);
    expect(k!.lng).toBeLessThan(28.03);
  });

  it("GeoJSON [lng,lat] sırasını doğru yorumlar (lat/lng takla atmaz)", () => {
    // [28.02, 41.11] → lng=28.02 (Türkiye boylamı), lat=41.11 (enlem)
    const k = parselKoordinatCikar(GEOMETRY)!;
    expect(k.lng).toBeCloseTo(28.02, 1);
    expect(k.lat).toBeCloseTo(41.11, 1);
  });

  it("Türkiye bbox dışındaki bozuk koordinatları eler", () => {
    const bozuk = `"geometry":{"coordinates":[[[0,0],[1,1]]]}`;
    expect(parselKoordinatCikar(bozuk)).toBeNull();
  });

  it("geometry yoksa null döner", () => {
    expect(parselKoordinatCikar("<html>bos</html>")).toBeNull();
  });
});

// Gerçek detay sayfasından alınmış başlık işaretleyicileri
const H1 = `<h1 class="text-base font-semibold text-(--color-fg-default) md:text-2xl">Değirmenköy&#x27;de 220 M² Değeri Günden Güne Artan Yatırım Fırsatı</h1>`;
const OGTITLE = `<meta property="og:title" content="Emre Demirkiran Arsa Ofisi İstanbul Silivri Satılık Tarla 850,000 TL #19780846">`;

describe("baslikCikar", () => {
  it("<h1>'i tercih eder ve HTML varlıklarını çözer", () => {
    // <h1> satıcının kendi başlığı; rafinerinin aradığı sinyaller (hisseli,
    // kooperatif, hobi bahçesi) burada geçiyor. <title>/og:title ise SEO kalıbı.
    expect(baslikCikar(H1)).toBe("Değirmenköy'de 220 M² Değeri Günden Güne Artan Yatırım Fırsatı");
  });

  it("<h1> yoksa og:title'a düşer", () => {
    expect(baslikCikar(OGTITLE)).toContain("Silivri Satılık Tarla");
  });

  it("<h1> varsa og:title'ı KULLANMAZ", () => {
    const b = baslikCikar(H1 + OGTITLE)!;
    expect(b).toContain("Yatırım Fırsatı");
    expect(b).not.toContain("Emre");
  });

  it("hiçbiri yoksa null döner", () => {
    expect(baslikCikar("<html><body>bos</body></html>")).toBeNull();
  });

  it("çok kısa başlığı kabul etmez", () => {
    expect(baslikCikar("<h1>Arsa</h1>")).toBeNull();
  });

  it("rafinerinin aradığı sinyalleri korur", () => {
    const b = baslikCikar("<h1>HİSSELİ TAPU Kooperatif Hobi Bahçesi Satılık</h1>")!;
    expect(b).toContain("HİSSELİ");
    expect(b).toContain("Kooperatif");
  });
});

describe("detaySayfasiParse", () => {
  it("tüm alanları birlikte çıkarır", () => {
    const z = detaySayfasiParse(JSONLD + GEOMETRY + TAPU + H1);
    expect(z.imarDurumu).toBe("Tarla");
    expect(z.tapuDurumu).toBe("Hisseli Tapu");
    expect(z.baslik).toContain("Değirmenköy");
    expect(z.lat).not.toBeNull();
    expect(z.lng).not.toBeNull();
  });

  it("hiçbir alan yoksa hepsini null döner (çökmeden)", () => {
    const z = detaySayfasiParse("<html><body>alakasiz</body></html>");
    expect(z).toEqual({ imarDurumu: null, tapuDurumu: null, baslik: null, lat: null, lng: null });
  });
});
