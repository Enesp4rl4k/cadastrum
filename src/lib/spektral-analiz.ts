/**
 * Spektral Analiz & Uzaktan Algılama Motoru (Sentinel-2 / Landsat).
 *
 * Çok spektral bant verilerini kullanarak arazi yüzey indekslerini hesaplar:
 *   - NDVI: Bitki örtüsü sağlığı, biyokütle yoğunluğu ve kuraklık tespiti
 *   - NDWI: Yüzey suyu varlığı, sulak alan ve toprak nem doygunluğu
 *   - NDBI: Yapılaşma, çatı, asfalt ve betonlaşma tespiti
 *   - SAVI: Seyrek bitkili/kurak alanlar için toprak arkaplan düzeltmeli vejetasyon
 *   - EVI: Yüksek biyokütleli ormanlarda doygunluğu önleyen gelişmiş vejetasyon
 *   - Değişim Tespiti: İki farklı tarih arasındaki spektral anomali ve yapılaşma tespiti
 */

export interface SentinelBantlari {
  /** Band 2 - Mavi (490 nm) */
  blue: number;
  /** Band 3 - Yeşil (560 nm) */
  green: number;
  /** Band 4 - Kırmızı (665 nm) */
  red: number;
  /** Band 8 - Yakın Kızılötesi / NIR (842 nm) */
  nir: number;
  /** Band 11 - Kısa Dalga Kızılötesi / SWIR-1 (1610 nm) */
  swir1: number;
  /** Band 12 - Kısa Dalga Kızılötesi / SWIR-2 (2190 nm) (Opsiyonel) */
  swir2?: number;
}

export type AraziOrtusuTipi =
  | "su"
  | "yogun-vejetasyon"
  | "orta-vejetasyon"
  | "seyrek-vejetasyon"
  | "ciplak-toprak"
  | "yapilasma-beton"
  | "belirsiz";

export interface SpektralIndeksSonucu {
  ndvi: number;
  ndwi: number;
  ndbi: number;
  savi: number;
  evi: number;
  sinif: AraziOrtusuTipi;
  vejetasyonSagligi: "mukemmel" | "iyi" | "orta" | "stresli" | "yok";
  yapilasmaOraniYuzde: number;
  suNemDoygunlugu: "doygun" | "nemli" | "kuru" | "kurak";
  aciklama: string;
}

export interface ZamansalDegisimSonucu {
  deltaNdvi: number;
  deltaNdbi: number;
  deltaNdwi: number;
  durum: "stabil" | "yeni-yapilasma" | "vejetasyon-kaybi" | "hafriyat-toprak-hareketi" | "yesillenme";
  ciddiyet: "dusuk" | "orta" | "yuksek";
  aciklama: string;
}

/**
 * Normalized Difference Vegetation Index (NDVI)
 * Formül: (NIR - RED) / (NIR + RED)
 * Aralık: [-1, +1]
 */
export function hesaplaNdvi(nir: number, red: number): number {
  const payda = nir + red;
  if (payda <= 0.0001) return 0;
  return Number(((nir - red) / payda).toFixed(4));
}

/**
 * Normalized Difference Water Index (NDWI - McFeeters)
 * Formül: (GREEN - NIR) / (GREEN + NIR)
 * Aralık: [-1, +1]
 */
export function hesaplaNdwi(green: number, nir: number): number {
  const payda = green + nir;
  if (payda <= 0.0001) return 0;
  return Number(((green - nir) / payda).toFixed(4));
}

/**
 * Normalized Difference Built-up Index (NDBI)
 * Formül: (SWIR - NIR) / (SWIR + NIR)
 * Aralık: [-1, +1]
 */
export function hesaplaNdbi(swir: number, nir: number): number {
  const payda = swir + nir;
  if (payda <= 0.0001) return 0;
  return Number(((swir - nir) / payda).toFixed(4));
}

/**
 * Soil Adjusted Vegetation Index (SAVI)
 * Formül: ((NIR - RED) / (NIR + RED + L)) * (1 + L), L = 0.5 varsayılan
 */
export function hesaplaSavi(nir: number, red: number, L = 0.5): number {
  const payda = nir + red + L;
  if (payda <= 0.0001) return 0;
  return Number((((nir - red) / payda) * (1 + L)).toFixed(4));
}

/**
 * Enhanced Vegetation Index (EVI)
 * Formül: 2.5 * ((NIR - RED) / (NIR + 6*RED - 7.5*BLUE + 1))
 */
export function hesaplaEvi(nir: number, red: number, blue: number): number {
  const payda = nir + 6 * red - 7.5 * blue + 1;
  if (Math.abs(payda) <= 0.0001) return 0;
  const evi = 2.5 * ((nir - red) / payda);
  return Number(Math.max(-1, Math.min(1.5, evi)).toFixed(4));
}

/**
 * Çok spektral bant değerlerini analiz ederek arazi karakteristiğini sınıflandırır.
 */
export function spektralAnalizEt(bantlar: SentinelBantlari): SpektralIndeksSonucu {
  const ndvi = hesaplaNdvi(bantlar.nir, bantlar.red);
  const ndwi = hesaplaNdwi(bantlar.green, bantlar.nir);
  const ndbi = hesaplaNdbi(bantlar.swir1, bantlar.nir);
  const savi = hesaplaSavi(bantlar.nir, bantlar.red);
  const evi = hesaplaEvi(bantlar.nir, bantlar.red, bantlar.blue);

  let sinif: AraziOrtusuTipi = "belirsiz";
  let vejetasyonSagligi: SpektralIndeksSonucu["vejetasyonSagligi"] = "yok";
  let suNemDoygunlugu: SpektralIndeksSonucu["suNemDoygunlugu"] = "kurak";

  // Karar ağacı sınıflandırması
  if (ndwi > 0.3) {
    sinif = "su";
    suNemDoygunlugu = "doygun";
  } else if (ndbi > 0.1 && ndbi > ndvi) {
    sinif = "yapilasma-beton";
  } else if (ndvi >= 0.6) {
    sinif = "yogun-vejetasyon";
    vejetasyonSagligi = "mukemmel";
  } else if (ndvi >= 0.4) {
    sinif = "orta-vejetasyon";
    vejetasyonSagligi = "iyi";
  } else if (ndvi >= 0.2) {
    sinif = "seyrek-vejetasyon";
    vejetasyonSagligi = "orta";
  } else {
    sinif = "ciplak-toprak";
    vejetasyonSagligi = ndvi > 0.1 ? "stresli" : "yok";
  }

  if (ndwi > 0.0) suNemDoygunlugu = "nemli";
  else if (ndwi > -0.2) suNemDoygunlugu = "kuru";
  else suNemDoygunlugu = "kurak";

  const yapilasmaOraniYuzde = Math.max(0, Math.min(100, Math.round((ndbi + 0.5) * 80)));

  let aciklama = "";
  switch (sinif) {
    case "su":
      aciklama = "Yüzey suyu veya sulak alan varlığı tespit edildi.";
      break;
    case "yapilasma-beton":
      aciklama = `Yapılaşma ve sert zemin sinyali baskın (NDBI: ${ndbi}).`;
      break;
    case "yogun-vejetasyon":
      aciklama = `Canlı ve yoğun bitki örtüsü / tarımsal verim yüksek (NDVI: ${ndvi}).`;
      break;
    case "orta-vejetasyon":
      aciklama = `Orta düzey bitki örtüsü veya düzenli tarım arazisi (NDVI: ${ndvi}).`;
      break;
    case "seyrek-vejetasyon":
      aciklama = `Seyrek bitki örtüsü veya mera/çalılık arazi (NDVI: ${ndvi}, SAVI: ${savi}).`;
      break;
    case "ciplak-toprak":
      aciklama = `Çıplak zemin, nadas veya kayalık arazi yapısı (NDVI: ${ndvi}).`;
      break;
    default:
      aciklama = "Spektral sinyal karmaşık.";
  }

  return {
    ndvi,
    ndwi,
    ndbi,
    savi,
    evi,
    sinif,
    vejetasyonSagligi,
    yapilasmaOraniYuzde,
    suNemDoygunlugu,
    aciklama,
  };
}

/**
 * İki farklı zaman damgasındaki spektral gözlemleri karşılaştırarak parseldeki
 * fiziksel değişimleri tespit eder.
 */
export function zamansalDegisimAnalizi(
  eskiGozlem: SentinelBantlari,
  yeniGozlem: SentinelBantlari,
): ZamansalDegisimSonucu {
  const eski = spektralAnalizEt(eskiGozlem);
  const yeni = spektralAnalizEt(yeniGozlem);

  const deltaNdvi = Number((yeni.ndvi - eski.ndvi).toFixed(4));
  const deltaNdbi = Number((yeni.ndbi - eski.ndbi).toFixed(4));
  const deltaNdwi = Number((yeni.ndwi - eski.ndwi).toFixed(4));

  // Yapılaşma artışı: NDBI belirgin arttı, NDVI düştü
  if (deltaNdbi >= 0.20 && deltaNdvi <= -0.15) {
    return {
      deltaNdvi,
      deltaNdbi,
      deltaNdwi,
      durum: "yeni-yapilasma",
      ciddiyet: "yuksek",
      aciklama: "Arazide yeni betonlaşma / bina inşaatı veya çatı yapımı tespit edildi.",
    };
  }

  // Hafriyat / Toprak hareketi: NDBI arttı, NDVI sıfıra yaklaştı
  if (deltaNdvi <= -0.30 && Math.abs(deltaNdbi) < 0.15) {
    return {
      deltaNdvi,
      deltaNdbi,
      deltaNdwi,
      durum: "vejetasyon-kaybi",
      ciddiyet: "orta",
      aciklama: "Ciddi bitki örtüsü kaybı, ağaç kesimi veya hasat/kuraklık tespiti.",
    };
  }

  // Yeşillenme / Ağaçlandırma
  if (deltaNdvi >= 0.25) {
    return {
      deltaNdvi,
      deltaNdbi,
      deltaNdwi,
      durum: "yesillenme",
      ciddiyet: "dusuk",
      aciklama: "Arazi üzerinde vejetasyon gelişimi ve yeşillenme gerçekleşmiş.",
    };
  }

  return {
    deltaNdvi,
    deltaNdbi,
    deltaNdwi,
    durum: "stabil",
    ciddiyet: "dusuk",
    aciklama: "Dönemler arasında arazi yüzeyinde anlamlı bir değişim gözlenmedi.",
  };
}