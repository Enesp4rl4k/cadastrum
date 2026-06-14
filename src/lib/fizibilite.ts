// Çok basit fizibilite hesaplayıcısı. Kullanıcı varsayımları girer,
// preset birim maliyet/gelir tahminleri başlangıç değeri olur.

export type YapiTipi = "depo" | "villa" | "apartman" | "isyeri" | "ozel";

export interface YapiPreset {
  ad: string;
  insaatBirimMaliyet: number; // TL/m² (kaba)
  satisBirimFiyat: number; // TL/m² (orta seviye)
  kiraAylikBirim: number; // TL/m²/ay (orta seviye)
  kullanimOranı: number; // arsa alanına göre kullanılabilir m² oranı
}

export const YAPI_PRESETLERI: Record<YapiTipi, YapiPreset> = {
  depo: {
    ad: "Depo / Lojistik",
    insaatBirimMaliyet: 18000,
    satisBirimFiyat: 35000,
    kiraAylikBirim: 220,
    kullanimOranı: 0.6,
  },
  villa: {
    ad: "Villa",
    insaatBirimMaliyet: 32000,
    satisBirimFiyat: 65000,
    kiraAylikBirim: 350,
    kullanimOranı: 0.3,
  },
  apartman: {
    ad: "Apartman (4 kat)",
    insaatBirimMaliyet: 22000,
    satisBirimFiyat: 55000,
    kiraAylikBirim: 280,
    kullanimOranı: 1.2, // emsal 1.2 varsayım
  },
  isyeri: {
    ad: "İşyeri / Mağaza",
    insaatBirimMaliyet: 25000,
    satisBirimFiyat: 50000,
    kiraAylikBirim: 400,
    kullanimOranı: 0.8,
  },
  ozel: {
    ad: "Özel (manuel)",
    insaatBirimMaliyet: 20000,
    satisBirimFiyat: 40000,
    kiraAylikBirim: 250,
    kullanimOranı: 0.5,
  },
};

export interface FizibiliteGirdi {
  arsaAlani: number; // m²
  arsaMaliyet: number; // TL
  yapiTipi: YapiTipi;
  preset: YapiPreset; // override ile
  hedef: "satis" | "kira";
}

export interface FizibiliteSonuc {
  insaatAlani: number;
  insaatMaliyet: number;
  toplamMaliyet: number;
  beklenenSatis?: number;
  netKar?: number;
  karMarji?: number; // %
  aylikKira?: number;
  geriOdemeYil?: number; // sadece kira hedefinde
  yillikGetiri?: number; // %
  not: string;
}

export function fizibiliteHesapla(g: FizibiliteGirdi): FizibiliteSonuc {
  const insaatAlani = g.arsaAlani * g.preset.kullanimOranı;
  const insaatMaliyet = insaatAlani * g.preset.insaatBirimMaliyet;
  const toplamMaliyet = g.arsaMaliyet + insaatMaliyet;

  if (g.hedef === "satis") {
    const beklenenSatis = insaatAlani * g.preset.satisBirimFiyat;
    const netKar = beklenenSatis - toplamMaliyet;
    const karMarji = toplamMaliyet > 0 ? (netKar / toplamMaliyet) * 100 : 0;
    return {
      insaatAlani: Math.round(insaatAlani),
      insaatMaliyet: Math.round(insaatMaliyet),
      toplamMaliyet: Math.round(toplamMaliyet),
      beklenenSatis: Math.round(beklenenSatis),
      netKar: Math.round(netKar),
      karMarji: Math.round(karMarji * 10) / 10,
      not:
        karMarji > 30
          ? "Yüksek getirili — varsayımları stress-test et."
          : karMarji > 10
            ? "Pozitif marj — risk-toleransına bağlı kabul edilebilir."
            : karMarji > 0
              ? "Düşük marj — fiyat sapmasına karşı kırılgan."
              : "Negatif — varsayımları yeniden değerlendir.",
    };
  } else {
    const aylikKira = insaatAlani * g.preset.kiraAylikBirim;
    const yillikKira = aylikKira * 12;
    const geriOdemeYil = yillikKira > 0 ? toplamMaliyet / yillikKira : Infinity;
    const yillikGetiri = toplamMaliyet > 0 ? (yillikKira / toplamMaliyet) * 100 : 0;
    return {
      insaatAlani: Math.round(insaatAlani),
      insaatMaliyet: Math.round(insaatMaliyet),
      toplamMaliyet: Math.round(toplamMaliyet),
      aylikKira: Math.round(aylikKira),
      geriOdemeYil: Math.round(geriOdemeYil * 10) / 10,
      yillikGetiri: Math.round(yillikGetiri * 10) / 10,
      not:
        yillikGetiri > 15
          ? "Yüksek kira getirisi — bölge ortalamasına göre doğrula."
          : yillikGetiri > 8
            ? "Makul kira getirisi."
            : yillikGetiri > 0
              ? "Düşük getiri — TÜFE/mevduat ile karşılaştır."
              : "Negatif — model girdilerini gözden geçir.",
    };
  }
}

export function trFmt(n: number): string {
  return n.toLocaleString("tr-TR", { maximumFractionDigits: 0 });
}
