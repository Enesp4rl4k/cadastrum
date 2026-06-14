/**
 * PVGIS (European Commission Joint Research Centre) — ücretsiz, anahtar gerekmez.
 * Türkiye dahil tüm Avrupa için yüksek doğrulukla yıllık PV üretim tahmini verir.
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

export interface PvProjeksiyonu {
  arsaM2: number;
  /** Panel kaplama oranı (default 0.50 — yapı/yol/gölge için %50) */
  kaplamaOrani: number;
  /** Panel başına kWp (kristalin Si paneller için ~0.18 kWp/m²) */
  kwpPerM2: number;
  /** Toplam kurulu güç kWp */
  kuruluKwp: number;
  /** Yıllık üretim kWh */
  yillikUretimKwh: number;
  /** Ortalama TL kazanç (kullanıcı tarifesine göre) */
  yillikGelirTl: number;
  /** Yatırım tahmini TL (kWp başına) */
  yatirimTl: number;
  /** Geri ödeme süresi yıl */
  geriOdemeYil: number;
}

/**
 * Türkiye için ortalama:
 * - Lisanssız çatı GES için satın alma (perakende net) ~3 TL/kWh (2025)
 * - Lisanslı tarla GES YEK Destekleme ~2.6 TL/kWh
 * - Kurulum 2025 ~25.000 TL/kWp (panel + invertör + montaj + bağlantı)
 */
const VARSAYILAN_TARIFE_TL_KWH = 3.0;
const VARSAYILAN_KURULUM_TL_KWP = 25_000;
const KWP_PER_M2 = 0.18; // mono kristalin Si

interface PvgisYanit {
  inputs: {
    location: { latitude: number; longitude: number; elevation: number };
    mounting_system: { fixed: { slope: { value: number; optimal: boolean } } };
  };
  outputs: {
    monthly: { fixed: { month: number; E_m: number; "H(i)_m": number }[] };
    totals: {
      fixed: {
        E_y: number; // Yıllık üretim kWh/kWp
        "H(i)_y": number; // Yıllık radyasyon kWh/m²
        SD_y?: number; // Yıllık standart sapma
      };
    };
  };
  meta: { inputs: { pv_module: { technology: string }; meteo_data: { radiation_db: string; year_min: number; year_max: number } } };
}

export async function gunesAnalizGetir(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<GunesAnalizi> {
  // PVGIS optimum eğimi otomatik hesaplar (angle parametresini boş bırakırız)
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

export function pvProjeksiyonHesapla(
  arsaM2: number,
  yillikKwhPerKwp: number,
  options: {
    kaplamaOrani?: number;
    tarifeTlKwh?: number;
    kurulumTlKwp?: number;
  } = {},
): PvProjeksiyonu {
  const kaplama = options.kaplamaOrani ?? 0.5;
  const tarife = options.tarifeTlKwh ?? VARSAYILAN_TARIFE_TL_KWH;
  const kurulumBirim = options.kurulumTlKwp ?? VARSAYILAN_KURULUM_TL_KWP;

  const panelliM2 = arsaM2 * kaplama;
  const kuruluKwp = panelliM2 * KWP_PER_M2;
  const yillikUretimKwh = kuruluKwp * yillikKwhPerKwp;
  const yillikGelirTl = yillikUretimKwh * tarife;
  const yatirimTl = kuruluKwp * kurulumBirim;
  const geriOdemeYil = yillikGelirTl > 0 ? yatirimTl / yillikGelirTl : Infinity;

  return {
    arsaM2,
    kaplamaOrani: kaplama,
    kwpPerM2: KWP_PER_M2,
    kuruluKwp: Math.round(kuruluKwp * 10) / 10,
    yillikUretimKwh: Math.round(yillikUretimKwh),
    yillikGelirTl: Math.round(yillikGelirTl),
    yatirimTl: Math.round(yatirimTl),
    geriOdemeYil: Math.round(geriOdemeYil * 10) / 10,
  };
}

export function gunesKalitesiSiniflandir(yillikKwhPerKwp: number): {
  sinif: string;
  renk: "success" | "warning" | "danger";
  not: string;
} {
  if (yillikKwhPerKwp >= 1600)
    return {
      sinif: "Mükemmel",
      renk: "success",
      not: "Türkiye'nin en güneşli kuşağı (Akdeniz/GAP). PV yatırım çok cazip.",
    };
  if (yillikKwhPerKwp >= 1400)
    return {
      sinif: "Çok iyi",
      renk: "success",
      not: "Türkiye ortalamasının üstü. Ticari GES için uygun.",
    };
  if (yillikKwhPerKwp >= 1200)
    return {
      sinif: "İyi",
      renk: "warning",
      not: "Türkiye ortalaması civarı. Yatırım yapılabilir, geri ödeme 7-10 yıl.",
    };
  if (yillikKwhPerKwp >= 1000)
    return {
      sinif: "Orta",
      renk: "warning",
      not: "Karadeniz/Doğu Anadolu seviyesi. Geri ödeme 10-15 yıl.",
    };
  return {
    sinif: "Düşük",
    renk: "danger",
    not: "Yüksek enlem veya yoğun bulutlu bölge. PV ekonomik olmayabilir.",
  };
}
