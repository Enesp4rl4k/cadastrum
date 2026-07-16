/**
 * Fizibilite hesaplayıcısı.
 *
 * Preset fiyatlar: Temmuz 2026 Türkiye inşaat maliyet endeksleri.
 * Kaynak: Türkiye İnşaat Maliyetleri (TÜİK YEM, Çevre ve Şehircilik Bakanlığı birim fiyatları).
 *   - Kaba inşaat: ₺28-45K/m² (büyükşehir orta kalite, 2026 Q1)
 *   - İnce işçilik dahil: ₺40-65K/m²
 *   - Satış fiyatı: büyükşehir ortalama ₺80-160K/m²
 *   - Kira: büyükşehir ₺500-900 TL/m²/ay
 *
 * Not: Kullanıcı tüm değerleri override edebilir. Presetler yalnızca
 * başlangıç noktası; gerçek analiz için yerel verilerle kalibre edilmeli.
 */

export type YapiTipi = "depo" | "villa" | "apartman" | "isyeri" | "ozel";

export interface YapiPreset {
  ad: string;
  insaatBirimMaliyet: number; // TL/m² (kaba + ince işçilik ortalama)
  satisBirimFiyat: number;    // TL/m² (orta seviye, büyükşehir)
  kiraAylikBirim: number;     // TL/m²/ay (brüt, büyükşehir)
  kullanimOranı: number;      // arsa alanına göre inşaat alanı (emsal)
  /** Açıklama — kullanıcıya gösterilir */
  aciklama: string;
}

/**
 * Yapı tipi presetleri — Temmuz 2026 Türkiye büyükşehir ortalama değerleri.
 * Küçük şehirlerde inşaat maliyeti %15-30 daha düşük, satış fiyatı %40-60 daha düşük.
 */
export const YAPI_PRESETLERI: Record<YapiTipi, YapiPreset> = {
  depo: {
    ad: "Depo / Lojistik",
    insaatBirimMaliyet: 32_000,  // sade beton+çelik, düşük işçilik
    satisBirimFiyat:    75_000,  // endüstriyel bölge satış
    kiraAylikBirim:     550,     // m²/ay (lojistik bölge)
    kullanimOranı:      0.65,
    aciklama: "Tek katlı, betonarme/çelik depo. Lojistik bölgesi varsayımı.",
  },
  villa: {
    ad: "Villa",
    insaatBirimMaliyet: 58_000,  // kaliteli malzeme + peyzaj
    satisBirimFiyat:   165_000,  // müstakil villa, iyi konum
    kiraAylikBirim:     900,     // m²/ay (villa kira)
    kullanimOranı:      0.3,     // villa emsal genelde 0.20-0.40
    aciklama: "Müstakil villa, kaliteli işçilik. Emsal 0.30 varsayımı.",
  },
  apartman: {
    ad: "Apartman (4 kat)",
    insaatBirimMaliyet: 45_000,  // orta kalite, 4 kat betonarme
    satisBirimFiyat:   120_000,  // büyükşehir orta konum
    kiraAylikBirim:     700,     // m²/ay
    kullanimOranı:      1.2,     // emsal 1.20 (toplam inşaat / arsa)
    aciklama: "4 katlı betonarme. Emsal 1.20 (4 kat × %30 TAKS). Büyükşehir varsayımı.",
  },
  isyeri: {
    ad: "İşyeri / Mağaza",
    insaatBirimMaliyet: 42_000,  // ticari kat, orta kalite
    satisBirimFiyat:   130_000,  // ticari değer genelde konuttan yüksek
    kiraAylikBirim:     850,     // ticari kira, caddeli
    kullanimOranı:      0.8,
    aciklama: "Zemin+1 katlı ticari yapı. Cadde cephesi varsayımı.",
  },
  ozel: {
    ad: "Özel (manuel giriş)",
    insaatBirimMaliyet: 40_000,
    satisBirimFiyat:   100_000,
    kiraAylikBirim:     650,
    kullanimOranı:      0.5,
    aciklama: "Tüm değerleri kendinize göre düzenleyin.",
  },
};

/** Preset güncelleme tarihi — kullanıcıya gösterilir */
export const PRESET_TARIHI = "Temmuz 2026";

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
