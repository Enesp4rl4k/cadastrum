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

describe("detaySayfasiParse", () => {
  it("tüm alanları birlikte çıkarır", () => {
    const z = detaySayfasiParse(JSONLD + GEOMETRY + TAPU);
    expect(z.imarDurumu).toBe("Tarla");
    expect(z.tapuDurumu).toBe("Hisseli Tapu");
    expect(z.lat).not.toBeNull();
    expect(z.lng).not.toBeNull();
  });

  it("hiçbir alan yoksa hepsini null döner (çökmeden)", () => {
    const z = detaySayfasiParse("<html><body>alakasiz</body></html>");
    expect(z).toEqual({ imarDurumu: null, tapuDurumu: null, lat: null, lng: null });
  });
});
