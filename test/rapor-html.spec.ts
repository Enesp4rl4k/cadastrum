import { describe, it, expect } from "vitest";
import { raporHtmlUret } from "../src/lib/rapor-html";
import type { RaporVerisi } from "../src/lib/rapor-data";
import type { Parsel } from "../src/types/tkgm";
import type { FiyatTahmini } from "../src/lib/fiyat-tahmin";

const parsel: Parsel = {
  mahalleKodu: 1, ilKodu: 48, ilceKodu: 100,
  adaNo: 152, parselNo: 7, alan: 1240, nitelik: "Arsa", pafta: "N18-a",
  ilAd: "Muğla", ilceAd: "Bodrum", mahalleAd: "Yalıkavak",
  durum: "aktif", gittigiParseller: [],
  geometri: { type: "Polygon", coordinates: [] },
  merkezNokta: { lat: 37.105, lng: 27.286 },
  koordinatlar: [
    { lat: 37.1050, lng: 27.2860 },
    { lat: 37.1053, lng: 27.2866 },
    { lat: 37.1049, lng: 27.2869 },
    { lat: 37.1046, lng: 27.2863 },
  ],
};

const fiyat = {
  altPerM2: 10800, beklenenPerM2: 12500, ustPerM2: 14200,
  toplamAlt: 13_392_000, toplamBeklenen: 15_500_000, toplamUst: 17_608_000,
  bilesenler: [], guven: "yuksek", guvenAciklama: "",
  baselineKaynak: "ilanGozlem-mahalle", baselineDeger: 12500, baselineNot: "", baselineAdet: 9,
  guvenSkoru: 72, veriKalitesiNotlari: [], guvenKirilimi: [], sonrakiHamleler: [],
  aralikGenisligiYuzde: 27, tazelikOzeti: null,
  emsalOzeti: null,
  imarOzeti: { sinif: "konut-imarli", kaynak: "eplan-resmi", not: "", resmiDetay: null },
  emsalListesi: [
    { fiyatPerM2: 13200, alan: 980, benzerlik: 0.9, tazelikGun: 12, ilanNo: "a" },
    { fiyatPerM2: 11800, alan: 1500, benzerlik: 0.8, tazelikGun: 28, ilanNo: "b" },
  ],
} as unknown as FiyatTahmini;

function veriYap(over: Partial<RaporVerisi> = {}): RaporVerisi {
  return {
    schema: 1, uretildiAt: Date.now(), parsel,
    cevre: null, egim: null, ePlan: null, fiyat, riskler: [], ...over,
  };
}

describe("raporHtmlUret", () => {
  it("dolu veriden geçerli HTML üretir", () => {
    const html = raporHtmlUret(veriYap());
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain("Ada 152 / Parsel 7");
    expect(html).toContain("Yatırımcı Sunum Raporu");
    expect(html).toContain("<polygon"); // gerçek parsel geometrisi overlay'i
    expect(html).toContain("World_Imagery/MapServer/export"); // Esri uydu paneli
    expect(html).toContain('property="og:image"'); // sosyal paylaşım kartı (büyüme döngüsü)
    expect(html).toContain('property="og:title"');
    expect(html).toContain("cadastrum.com.tr"); // install CTA
    expect(html).toContain('data-target="15500000"'); // değer count-up hedefi
    expect(html).toContain("12.500 ₺/m²");
  });

  it("etkilesim:false → inline script/toolbar atlanır (extension CSP), değer yine görünür", () => {
    const html = raporHtmlUret(veriYap(), { etkilesim: false });
    expect(html).not.toContain("<script>"); // CSP-safe
    expect(html).not.toContain('id="cadShare"'); // toolbar elementi yok
    expect(html).not.toContain('onclick="'); // inline handler yok
    expect(html).toContain("₺15.500.000"); // değer JS'siz doğru (progressive)
  });

  it("fiyat null iken çökmeden 'değerleme bekliyor' gösterir", () => {
    const html = raporHtmlUret(veriYap({ fiyat: null }));
    expect(html).toContain("Değerleme bekliyor");
    expect(html).not.toContain('data-target="'); // count-up hedefi yok (selector literali hariç)
  });

  it("risk metnindeki HTML'i escape eder (XSS guard)", () => {
    const html = raporHtmlUret(veriYap({
      riskler: [{
        kod: "X", baslik: "<img src=x onerror=alert(1)>", aciklama: "a & b <script>",
        seviye: "kritik", kaynak: "eplan",
      }],
    }));
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
  });

  it("geometrisiz parselde harita yerine yer tutucu koyar", () => {
    const html = raporHtmlUret(veriYap({ parsel: { ...parsel, koordinatlar: [] } }));
    expect(html).toContain("Parsel geometrisi yok");
  });
});
