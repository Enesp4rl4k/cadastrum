import { describe, it, expect } from "vitest";
import {
  KurumsalEkspertizRaporuUretici,
  type KurumsalRaporGirdisi,
} from "../src/lib/rapor/kurumsal-ekspertiz-raporu";

describe("Kurumsal Ekspertiz Raporu Üretici (FAZ 4)", () => {
  const uretici = new KurumsalEkspertizRaporuUretici();

  it("Tam kurumsal HTML ekspertiz çıktısını eksiksiz üretir", () => {
    const girdi: KurumsalRaporGirdisi = {
      firsat: {
        ilan: {
          ilanNo: "1192849102",
          baslik: "Urla Çamlıçay Denize Yakın İmarlı Arsa",
          fiyatTL: 5_000_000,
          m2: 1000,
          il: "izmir",
          ilce: "urla",
          kategori: "arsa",
        },
        sentez: {
          firsat: {
            tahminiPiyasaDegeriTL: 7_500_000,
            iskontoOraniYuzde: 33.3,
            potansiyelKarTL: 2_500_000,
            firsatDerecesi: "yuksek-kelepir",
            gerekce: "Piyasa altı",
          },
          hukuk: {
            riskSkoru: 10,
            riskSeviyesi: "dusuk",
            tespitEdilenRiskler: [],
            ilgiliMevzuat: [],
            degerlendirmeOzeti: "Temiz",
          },
          nihaiTavsiye: "Güçlü Al",
          guvenSkoru: 90,
        },
        debate: {
          konsensusKarari: "guclu-al",
          efektifFirsatPuani: 92,
          uzlasmaOzeti: "Temiz ve yüksek kârlı fırsat.",
          turlar: [],
          aksiyonMaddeleri: ["Tapu teyidi yapın."],
        },
        iskontoYuzde: 33.3,
        potansiyelKarTL: 2_500_000,
        efektifSkor: 92,
        firsatRozeti: "GÜÇLÜ FIRSAT",
      },
      hazirlayan: {
        unvan: "Cadastrum Gayrimenkul Değerleme",
        danismanAdi: "Ahmet Yılmaz",
        iletisimNo: "+90 532 000 0000",
      },
    };

    const html = uretici.htmlRaporUret(girdi);

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("CADASTRUM • YATIRIM İSTİHBARATI");
    expect(html).toContain("5.000.000 ₺");
    expect(html).toContain("7.500.000 ₺");
    expect(html).toContain("Ahmet Yılmaz");
    expect(html).toContain("GÜÇLÜ FIRSAT");
  });
});