import { describe, it, expect } from "vitest";
import { degerlemeKarariAl, type DegerlemeAjaniGirdisi } from "../src/lib/degerler/degerleme-ajani";
import type { FiyatTahmini } from "../src/lib/fiyat-tahmin";

describe("UDES: degerleme-ajani modülü", () => {
  it("3 farklı yaklaşımı doğru ağırlıklandırıp UDES kararı üretir", () => {
    const mockFiyatTahmini: FiyatTahmini = {
      altPerM2: 8_000,
      beklenenPerM2: 10_000,
      ustPerM2: 12_000,
      toplamAlt: 4_000_000,
      toplamBeklenen: 5_000_000,
      toplamUst: 6_000_000,
      bilesenler: [],
      guven: "yuksek",
      guvenAciklama: "Test",
      baselineKaynak: "ilanGozlem-mahalle",
      baselineDeger: 10_000,
      baselineNot: "Test",
      baselineAdet: 5,
      guvenSkoru: 85,
      veriKalitesiNotlari: [],
      guvenKirilimi: [],
      sonrakiHamleler: [],
      aralikGenisligiYuzde: 40,
      tazelikOzeti: null,
      emsalOzeti: {
        secilenAdet: 5,
        mahalleAdet: 5,
        ilceAdet: 0,
        dogrulanabilirAdet: 3,
        ortalamaBenzerlik: 0.88,
        weightedAsking: 10_500,
        outlierAdet: 0,
        dovizDonusturulenAdet: 0,
      },
      imarOzeti: { sinif: "konut-imarli", kaynak: "ilan-imar", not: "İmarlı", resmiDetay: null },
      emsalListesi: [],
    };

    const girdi: DegerlemeAjaniGirdisi = {
      karsilastirmali: mockFiyatTahmini,
      gelir: {
        yontem: "dogrudan-kap",
        hesaplananDeger: 4_800_000,
        degerPerM2: 9_600,
        degerPerM2Arsa: 9_600,
        capRate: 0.05,
        grm: 20,
        brutKiraYillik: 300_000,
        netIsletmeGeliri: 240_000,
        guven: "yuksek",
        varsayimlar: [],
        sinirlayiciKosullar: [],
        aciklama: "Kira kapitalizasyonu",
      },
      maliyet: null,
      arsaAlanM2: 500,
    };

    const karar = degerlemeKarariAl(girdi);
    expect(karar.kullanilanYaklasimSayisi).toBe(2);
    expect(karar.beklenenPerM2).toBeGreaterThan(9_000);
    expect(karar.beklenenPerM2).toBeLessThan(11_000);
    expect(karar.uyumsuzluk.kategori).toBe("dusuk"); // %4 sapma (<%15)
    expect(karar.metodolojGerekce).toContain("DEĞERLEME METODOLOJİSİ");
  });
});