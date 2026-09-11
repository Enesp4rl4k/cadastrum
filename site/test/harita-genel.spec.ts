/**
 * Harita genel görünüm — uzak zoom'da ilçe başına tek nokta.
 *
 * NEDEN: harita sayfası görünen her ilçe için ayrı istek atıyordu; Türkiye
 * görünümünde yüzlerce istek backend'in saatlik sınırını ilk açılışta
 * dolduruyor ve sayfa boş kalıyordu (2026-07-16'dan beri). Uzak görünüm artık
 * tek /harita/ozet isteği.
 *
 * MUTASYON: harita-genel.ts'de `gorunumModu` karşılaştırmasını `> 100000`
 * yap (genel görünümü fiilen kapat) → "Türkiye görünümü genel" testi kırılır.
 */
import { describe, it, expect } from "vitest";
import {
  gorunumModu,
  genelNoktalariKur,
  istekHatasiMetni,
  DETAY_ILCE_MAX,
} from "../src/scripts/harita-genel";

describe("görünüm modu", () => {
  it("Türkiye görünümü (yüzlerce ilçe) GENEL — ilçe başına istek atılmaz", () => {
    expect(gorunumModu(900)).toBe("genel");
    expect(gorunumModu(DETAY_ILCE_MAX + 1)).toBe("genel");
  });

  it("yakın görünüm (az ilçe) DETAY", () => {
    expect(gorunumModu(DETAY_ILCE_MAX)).toBe("detay");
    expect(gorunumModu(3)).toBe("detay");
  });
});

describe("genel noktalar", () => {
  const merkezler = [
    { ilceKodu: 1, lat: 41.1, lng: 28.9 },
    { ilceKodu: 2, lat: 39.9, lng: 32.8 },
  ];

  it("her ilçe merkezine toplam işlemle ağırlıklı TEK nokta", () => {
    const { noktalar } = genelNoktalariKur(
      [
        { ilce_kodu: 1, nokta_sayisi: 50, toplam_islem: 1200 },
        { ilce_kodu: 2, nokta_sayisi: 10, toplam_islem: 300 },
      ],
      merkezler,
    );
    expect(noktalar).toHaveLength(2);
    // GeoJSON sırası [boylam, enlem]
    expect(noktalar[0]!.geometry.coordinates).toEqual([28.9, 41.1]);
    expect(noktalar[0]!.properties.sayi).toBe(1200);
  });

  it("merkezi bilinmeyen ilçe nokta ÜRETMEZ ama SAYILIR — bilinmeyen ile yok aynı değil", () => {
    const r = genelNoktalariKur([{ ilce_kodu: 999, nokta_sayisi: 5, toplam_islem: 40 }], merkezler);
    expect(r.noktalar).toHaveLength(0);
    expect(r.merkeziBilinmeyen).toBe(1);
  });

  it("işlemi olmayan ilçe sıfır ağırlıklı nokta ÜRETMEZ", () => {
    const r = genelNoktalariKur([{ ilce_kodu: 1, nokta_sayisi: 0, toplam_islem: 0 }], merkezler);
    expect(r.noktalar).toHaveLength(0);
  });
});

describe("istek hatası metni", () => {
  it("429 'veri yok' ile KARIŞTIRILMAZ — sınır mesajı ve bekleme süresi", () => {
    expect(istekHatasiMetni(429, 307)).toContain("İstek sınırına ulaşıldı");
    expect(istekHatasiMetni(429, 307)).toContain("6 dk");
    expect(istekHatasiMetni(429, null)).toContain("İstek sınırına ulaşıldı");
  });

  it("diğer hatalar kodla görünür", () => {
    expect(istekHatasiMetni(500, null)).toContain("HTTP 500");
  });
});
