/**
 * PVGIS (European Commission Joint Research Centre) & Solar Engine.
 *
 * Güneş Enerjisi (GES) Potansiyeli, 3D Arazi Topografya Uyumu & 25 Yıllık Finansal Simülasyon.
 *
 * https://re.jrc.ec.europa.eu/pvg_tools/en/
 */

const PVGIS_BASE = "https://re.jrc.ec.europa.eu/api/v5_3/PVcalc";

export interface GunesAnalizi {
  /** 1 kWp panelin yıllık üretimi (kWh) — bölgenin "güneş kalitesi" */
  yillikKwhPerKwp: number;
  /** Optimal sabit panel eğim açısı (°) */
  optimalAci: number;
  /** Aylık üretim dağılımı kWh */
  aylikUretim: { ay: number; kwh: number }[];
  /** Sistem kayıpları (%) — default 14% */
  kayiplar: number;
  /** Tahmini yıllık toplam radyasyon kWh/m² */
  yillikRadyasyonKwhM2: number;
  /** Hesaplama metodu */
  metod: string;
  /** Veri kaynağı */
  kaynak: string;
}

export interface GesTopografyaAnalizi {
  /** Bakı yönü verimlilik çarpanı (Güney: 1.0, Kuzey: 0.70, Doğu/Batı: 0.88) */
  bakiCarpani: number;
  /** Eğim açısı uygulanabilirlik notu */
  egimUygunlugu: "ideal" | "hafif-tesviye" | "zorlu-tesviye" | "uygunsuz";
  tesviyeMaliyetArtisiYuzde: number;
  netVerimlilikFaktoru: number;
}

export interface PvProjeksiyonu {
  arsaM2: number;
  /** Panel kaplama oranı (default 0.50 — yapı/yol/gölge için %50) */
  kaplamaOrani: number;
  /** Panel başına kWp (kristalin Si paneller için ~0.18 kWp/m²) */
  kwpPerM2: number;
  /** Toplam kurulu güç kWp */
  kuruluKwp: number;
  /** Yıllık net üretim kWh (1. yıl) */
  yillikUretimKwh: number;
  /** Ortalama TL kazanç (kullanıcı tarifesine göre) */
  yillikGelirTl: number;
  /** Yatırım tahmini TL (CAPEX) */
  yatirimTl: number;
  /** Geri ödeme süresi yıl (Basit amortisman) */
  geriOdemeYil: number;
  /** 25 Yıllık Seviyelendirilmiş Elektrik Maliyeti (LCOE) TL/kWh */
  lcoeTlKwh: number;
  /** 25 Yıllık Net Bugünkü Değer (NPV @ %12 iskonto) TL */
  npv25YilTl: number;
  /** 25 Yıllık Kümülatif Üretim MWh */
  toplamUretim25YilMwh: number;
}

export const VARSAYILAN_TARIFE_TL_KWH = 3.2; // 2026 piyasa takas + YEKDEM tahmini
export const VARSAYILAN_KURULUM_TL_KWP = 28_000; // Panel + Invertör + Montaj + Trafo
export const KWP_PER_M2 = 0.18; // Mono kristalin Si panel teknolojisi

interface PvgisYanit {
  inputs: {
    location: { latitude: number; longitude: number; elevation: number };
    mounting_system: { fixed: { slope: { value: number; optimal: boolean } } };
  };
  outputs: {
    monthly: { fixed: { month: number; E_m: number; "H(i)_m": number }[] };
    totals: {
      fixed: {
        E_y: number;
        "H(i)_y": number;
        SD_y?: number;
      };
    };
  };
  meta: { inputs: { pv_module: { technology: string }; meteo_data: { radiation_db: string; year_min: number; year_max: number } } };
}

export function gesTopografyaDegerlendir(
  egimYuzde: number = 0,
  bakiYonu: string = "G"
): GesTopografyaAnalizi {
  const yon = bakiYonu.toUpperCase();
  let bakiCarpani = 1.0;

  if (yon.includes("G") && !yon.includes("K")) {
    // Güney, Güney-Doğu, Güney-Batı
    bakiCarpani = yon === "G" ? 1.0 : 0.96;
  } else if (yon.includes("D") || yon.includes("B")) {
    // Doğu veya Batı
    bakiCarpani = 0.88;
  } else if (yon.includes("K")) {
    // Kuzey, Kuzey-Doğu, Kuzey-Batı
    bakiCarpani = 0.72;
  }

  let egimUygunlugu: GesTopografyaAnalizi["egimUygunlugu"] = "ideal";
  let tesviyeMaliyetArtisiYuzde = 0;

  if (egimYuzde <= 5) {
    egimUygunlugu = "ideal";
    tesviyeMaliyetArtisiYuzde = 0;
  } else if (egimYuzde <= 12) {
    egimUygunlugu = "hafif-tesviye";
    tesviyeMaliyetArtisiYuzde = 5;
  } else if (egimYuzde <= 20) {
    egimUygunlugu = "zorlu-tesviye";
    tesviyeMaliyetArtisiYuzde = 15;
  } else {
    egimUygunlugu = "uygunsuz";
    tesviyeMaliyetArtisiYuzde = 35;
  }

  const netVerimlilikFaktoru = Number((bakiCarpani * (1 - (egimYuzde > 20 ? 0.1 : 0))).toFixed(3));

  return {
    bakiCarpani,
    egimUygunlugu,
    tesviyeMaliyetArtisiYuzde,
    netVerimlilikFaktoru,
  };
}

export async function gunesAnalizGetir(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<GunesAnalizi> {
  const url = new URL(PVGIS_BASE);
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("peakpower", "1");
  url.searchParams.set("loss", "14");
  url.searchParams.set("outputformat", "json");
  url.searchParams.set("pvtechchoice", "crystSi");
  url.searchParams.set("mountingplace", "free");
  url.searchParams.set("fixed", "1");
  url.searchParams.set("optimalangles", "1");

  const res = await fetch(url.toString(), { signal });
  if (!res.ok) throw new Error(`PVGIS HTTP ${res.status}`);
  const data: PvgisYanit = await res.json();

  return {
    yillikKwhPerKwp: Math.round(data.outputs.totals.fixed.E_y),
    optimalAci: Math.round(data.inputs.mounting_system.fixed.slope.value),
    aylikUretim: data.outputs.monthly.fixed.map((m) => ({
      ay: m.month,
      kwh: Math.round(m.E_m),
    })),
    kayiplar: 14,
    yillikRadyasyonKwhM2: Math.round(data.outputs.totals.fixed["H(i)_y"]),
    metod: "PVGIS-SARAH3 + ERA5",
    kaynak: `EC JRC, ${data.meta.inputs.meteo_data.year_min}–${data.meta.inputs.meteo_data.year_max}`,
  };
}

export function gunesKalitesiSiniflandir(kwhPerKwp: number): {
  sinif: string;
  renk: "success" | "warning" | "danger";
  not: string;
} {
  if (kwhPerKwp >= 1600) {
    return {
      sinif: "Çok Yüksek Potansiyel (Güneş Kuşağı)",
      renk: "success",
      not: "Türkiye'nin en yüksek güneşlenme potansiyeline sahip bölgesi. GES yatırımı için ideal.",
    };
  }
  if (kwhPerKwp >= 1400) {
    return {
      sinif: "Yüksek Potansiyel",
      renk: "success",
      not: "GES yatırımları için oldukça verimli ve karlı bölge.",
    };
  }
  if (kwhPerKwp >= 1200) {
    return {
      sinif: "Orta Potansiyel",
      renk: "warning",
      not: "Standart GES verimliliği, öz tüketim için uygun.",
    };
  }
  return {
    sinif: "Düşük Potansiyel",
    renk: "danger",
    not: "Güneşlenme süresi sınırlı, yatırım geri dönüş süresi uzayabilir.",
  };
}

export function pvProjeksiyonHesapla(
  arsaM2: number,
  yillikKwhPerKwp: number,
  secenekler?: {
    kaplamaOrani?: number;
    kwpPerM2?: number;
    tarifeTlPerKwh?: number;
    tarifeTlKwh?: number;
    kurulumTlPerKwp?: number;
    bakiCarpani?: number;
    iskontoOrani?: number; // default %12
  },
): PvProjeksiyonu {
  const kaplama = secenekler?.kaplamaOrani ?? 0.5;
  const kwpM2 = secenekler?.kwpPerM2 ?? KWP_PER_M2;
  const tarife = secenekler?.tarifeTlPerKwh ?? secenekler?.tarifeTlKwh ?? VARSAYILAN_TARIFE_TL_KWH;
  const kurulumBirim = secenekler?.kurulumTlPerKwp ?? VARSAYILAN_KURULUM_TL_KWP;
  const bakiFaktoru = secenekler?.bakiCarpani ?? 1.0;
  const iskonto = secenekler?.iskontoOrani ?? 0.12;

  const panelAlani = arsaM2 * kaplama;
  const kuruluKwp = Math.round(panelAlani * kwpM2 * 10) / 10;
  const yillikNetKwhPerKwp = yillikKwhPerKwp * bakiFaktoru;
  const yillikUretimKwh = Math.round(kuruluKwp * yillikNetKwhPerKwp);
  const yillikGelirTl = Math.round(yillikUretimKwh * tarife);
  const yatirimTl = Math.round(kuruluKwp * kurulumBirim);
  const geriOdemeYil =
    yillikGelirTl > 0 ? Number((yatirimTl / yillikGelirTl).toFixed(1)) : 0;

  // 25 Yıllık Finansal Nakit Akışı Simülasyonu
  const DEGRADASYON_YILLIK = 0.005; // %0.5 yıllık verim kaybı
  const OPEX_ORANI = 0.015; // Yıllık bakım/işletme = CAPEX'in %1.5'i

  let toplamIskontoluMaliyet = yatirimTl;
  let toplamIskontoluUretimKwh = 0;
  let npv = -yatirimTl;
  let kumulatifUretimKwh = 0;

  for (let yil = 1; yil <= 25; yil++) {
    const yilVerimCarpani = Math.pow(1 - DEGRADASYON_YILLIK, yil - 1);
    const yilUretimKwh = yillikUretimKwh * yilVerimCarpani;
    kumulatifUretimKwh += yilUretimKwh;

    let yilOpex = yatirimTl * OPEX_ORANI;
    // 10. Yılda Invertör Yenileme CAPEX'in %15'i
    if (yil === 10) yilOpex += yatirimTl * 0.15;

    const yilGelir = yilUretimKwh * tarife;
    const yilNetNakit = yilGelir - yilOpex;

    const df = Math.pow(1 + iskonto, yil);
    npv += yilNetNakit / df;
    toplamIskontoluMaliyet += yilOpex / df;
    toplamIskontoluUretimKwh += yilUretimKwh / df;
  }

  const lcoeTlKwh =
    toplamIskontoluUretimKwh > 0
      ? Number((toplamIskontoluMaliyet / toplamIskontoluUretimKwh).toFixed(2))
      : 0;

  return {
    arsaM2,
    kaplamaOrani: kaplama,
    kwpPerM2: kwpM2,
    kuruluKwp,
    yillikUretimKwh,
    yillikGelirTl,
    yatirimTl,
    geriOdemeYil,
    lcoeTlKwh,
    npv25YilTl: Math.round(npv),
    toplamUretim25YilMwh: Math.round(kumulatifUretimKwh / 1000),
  };
}