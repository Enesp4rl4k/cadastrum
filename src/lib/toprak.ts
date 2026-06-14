/**
 * Toprak verisi — ISRIC SoilGrids API.
 *
 * Toprak tipi (kum/kil/silt %), organik karbon, pH, derinlik.
 * Tarımsal arsa değerlemesinde kritik (verimlilik göstergesi).
 *
 * API: https://rest.isric.org/soilgrids/v2.0/properties/query
 *   - Free, no API key
 *   - Lat/lng + property + depth
 *   - Global coverage (TR dahil)
 *
 * Bizim için 0-30cm derinlik (üst tabaka, tarımsal verim) yeterli.
 * Cache: aynı 0.05° quadrant — 30 gün (toprak yıllarca aynı).
 */

const SOILGRIDS_BASE = "https://rest.isric.org/soilgrids/v2.0/properties/query";

export type ToprakSinifi =
  | "kumlu"        // %70+ kum
  | "killi"        // %35+ kil
  | "tinli"        // dengeli (kum/kil/silt)
  | "siltli"       // %50+ silt
  | "karisik";     // belirsiz

export interface ToprakVerisi {
  /** Kum oranı (%) — 0-30cm */
  kum: number;
  /** Kil oranı (%) */
  kil: number;
  /** Silt oranı (%) */
  silt: number;
  /** Organik karbon (g/kg) */
  organikKarbon: number;
  /** pH (5-9 ölçek) */
  ph: number;
  /** Toprak sınıfı */
  sinif: ToprakSinifi;
  /** Tarımsal yorum */
  tarimYorum: string;
  /** İnşaat zemin yorumu */
  insaatYorum: string;
}

interface SoilGridsLayer {
  name?: string;
  depths?: Array<{
    range?: { top_depth?: number; bottom_depth?: number };
    values?: { mean?: number };
  }>;
}

interface SoilGridsResponse {
  properties?: {
    layers?: SoilGridsLayer[];
  };
}

const CACHE = new Map<string, { data: ToprakVerisi; fetchedAt: number }>();
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 gün — toprak yıllarca aynı

function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(2)}|${lng.toFixed(2)}`;
}

function siniflandir(kum: number, kil: number, silt: number): ToprakSinifi {
  if (kum >= 70) return "kumlu";
  if (kil >= 35) return "killi";
  if (silt >= 50) return "siltli";
  if (kum >= 30 && kil >= 20 && silt >= 20) return "tinli";
  return "karisik";
}

function tarimYorumu(sinif: ToprakSinifi, organik: number, ph: number): string {
  const verim =
    organik > 30 ? "yüksek verim" : organik > 15 ? "orta verim" : "düşük verim";
  const phNot =
    ph >= 6.5 && ph <= 7.5
      ? "nötr pH (ideal)"
      : ph < 6.5
        ? "asitik (kireçleme gerekebilir)"
        : "alkali (jips/sülfür gerekebilir)";

  switch (sinif) {
    case "kumlu":
      return `Kumlu toprak — drenaj iyi, ama su tutma zayıf. Sebze/turunçgil için sulama gerekli. ${verim}, ${phNot}.`;
    case "killi":
      return `Killi toprak — su tutma yüksek, drenaj zayıf. Tahıl/yonca uygun, sebzecilikte havalandırma gerek. ${verim}, ${phNot}.`;
    case "tinli":
      return `Tınlı (dengeli) toprak — tarım için ideal yapı. Geniş ürün yelpazesi mümkün. ${verim}, ${phNot}.`;
    case "siltli":
      return `Siltli toprak — verimli ama kompakte olabilir. Tahıl/sebze uygun. ${verim}, ${phNot}.`;
    case "karisik":
      return `Karışık toprak yapısı — saha keşfi tavsiye edilir. ${verim}, ${phNot}.`;
  }
}

function insaatYorumu(sinif: ToprakSinifi): string {
  switch (sinif) {
    case "kumlu":
      return "Kumlu zemin — taşıma kapasitesi orta, sıkıştırma gerekebilir";
    case "killi":
      return "Killi zemin — şişme/büzülme riski, derin temel + drenaj kritik";
    case "tinli":
      return "Tınlı zemin — taşıma kapasitesi iyi, standart temel yeterli";
    case "siltli":
      return "Siltli zemin — su sızıntısında oturma riski";
    case "karisik":
      return "Karışık yapı — zemin etüdü kritik";
  }
}

function meanFor(layer: SoilGridsLayer | undefined, topCm: number, bottomCm: number): number | null {
  if (!layer?.depths) return null;
  const found = layer.depths.find(
    (d) =>
      d.range?.top_depth === topCm && d.range?.bottom_depth === bottomCm,
  );
  return found?.values?.mean ?? null;
}

export async function toprakVerisiGetir(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<ToprakVerisi | null> {
  const key = cacheKey(lat, lng);
  const hit = CACHE.get(key);
  if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) {
    return hit.data;
  }

  // 0-30cm derinlik, 4 property
  const url = new URL(SOILGRIDS_BASE);
  url.searchParams.set("lat", lat.toFixed(4));
  url.searchParams.set("lon", lng.toFixed(4));
  ["sand", "clay", "silt", "soc", "phh2o"].forEach((p) =>
    url.searchParams.append("property", p),
  );
  url.searchParams.append("depth", "0-5cm");
  url.searchParams.append("depth", "5-15cm");
  url.searchParams.append("depth", "15-30cm");
  url.searchParams.set("value", "mean");

  try {
    const r = await fetch(url.toString(), { signal });
    if (!r.ok) return null;
    const data: SoilGridsResponse = await r.json();
    const layers = data.properties?.layers ?? [];

    const findLayer = (name: string): SoilGridsLayer | undefined =>
      layers.find((l) => l.name === name);

    // 0-30cm ortalaması — 3 derinlik katmanının ortalaması
    const avgFor = (layer: SoilGridsLayer | undefined): number | null => {
      if (!layer) return null;
      const vals = [
        meanFor(layer, 0, 5),
        meanFor(layer, 5, 15),
        meanFor(layer, 15, 30),
      ].filter((v): v is number => v != null);
      if (vals.length === 0) return null;
      return vals.reduce((s, v) => s + v, 0) / vals.length;
    };

    const sandRaw = avgFor(findLayer("sand"));     // g/kg
    const clayRaw = avgFor(findLayer("clay"));     // g/kg
    const siltRaw = avgFor(findLayer("silt"));     // g/kg
    const socRaw = avgFor(findLayer("soc"));       // dg/kg
    const phRaw = avgFor(findLayer("phh2o"));      // pH × 10

    if (sandRaw == null || clayRaw == null || siltRaw == null) return null;

    // Ölçek dönüşümü:
    //  - sand/clay/silt: g/kg → % (÷ 10)
    //  - SOC: dg/kg → g/kg (÷ 10)
    //  - pH: ölçeklenmiş ÷ 10
    const kum = Math.round(sandRaw / 10);
    const kil = Math.round(clayRaw / 10);
    const silt = Math.round(siltRaw / 10);
    const organikKarbon = socRaw != null ? Math.round((socRaw / 10) * 10) / 10 : 0;
    const ph = phRaw != null ? Math.round((phRaw / 10) * 10) / 10 : 7;

    const sinif = siniflandir(kum, kil, silt);
    const result: ToprakVerisi = {
      kum,
      kil,
      silt,
      organikKarbon,
      ph,
      sinif,
      tarimYorum: tarimYorumu(sinif, organikKarbon, ph),
      insaatYorum: insaatYorumu(sinif),
    };

    CACHE.set(key, { data: result, fetchedAt: Date.now() });
    return result;
  } catch {
    return null;
  }
}
