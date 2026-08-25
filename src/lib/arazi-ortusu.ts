/**
 * Arazi örtüsü/kullanım tipi — Copernicus CORINE Land Cover + ESA WorldCover.
 *
 * Problem: Parsel nitelik string'inden arazi tipi çıkarmak hatalı ve heuristic.
 * "Tarla" nitelikli parsel aslında kentsel dönüşüm bölgesinde olabilir ya da
 * "Arsa" nitelikli parsel orman sınırında.
 *
 * Çözüm: Koordinat → gerçek arazi sınıfı
 *
 * Birincil: ESA WorldCover 10m (2021) — Stac API, ücretsiz, 10m çözünürlük
 *   https://worldcover2021.esa.int/
 *
 * Fallback: Copernicus CORINE Land Cover 2018 — WMS GetFeatureInfo, 100m çözünürlük
 *   https://land.copernicus.eu/pan-european/corine-land-cover
 *
 * Cache: Dexie `araziOrtusuCache` — 90 gün TTL
 * (Arazi örtüsü yıllarda değişir, uzun cache mantıklı)
 *
 * Fiyat etkisi:
 *   - "Tarımsal" nitelikli parsel gerçekte kentsel → fiyat düzeltme +%20-40
 *   - "Arsa" nitelikli parsel gerçekte ormanlık → fiyat cezalandırma -%15
 *   - Sanayi/endüstri komşuluğu → -%8
 */

import { db } from "./db";

// ─── Tipler ──────────────────────────────────────────────────────────────────

/**
 * ESA WorldCover 2021 sınıf kodları (10m çözünürlük).
 * https://esa-worldcover.org/en/data
 */
export const ESA_WORLDCOVER_SINIFLAR: Readonly<Record<number, string>> = {
  10:  "Ağaçlık Alan",
  20:  "Çalılık",
  30:  "Otlak/Mera",
  40:  "Tarım Arazisi",
  50:  "Yerleşim/Kentsel",
  60:  "Çıplak/Seyrek Bitki",
  70:  "Kar/Buz",
  80:  "Su Kütlesi",
  90:  "Sulak Alan",
  95:  "Mangrov",
  100: "Yosun/Liken",
};

/**
 * Basitleştirilmiş arazi kategorisi — fiyat motoru için kullanılır.
 */
export type AraziKategori =
  | "kentsel"        // Yerleşim, yapılaşmış alan
  | "tarimsal"       // Tarım arazisi, bahçe
  | "ormanlik"       // Ağaçlık, çalılık
  | "mera"           // Otlak, mera
  | "su"             // Göl, nehir, deniz
  | "sulak-alan"     // Sulak alan
  | "cıplak"         // Çıplak arazi, kayalık
  | "bilinmiyor";    // API yanıtsız veya sınıf dışı

export interface AraziOrtusuSonuc {
  kategori: AraziKategori;
  /** ESA WorldCover sınıf kodu (varsa) */
  esaSinifKodu?: number;
  /** ESA WorldCover sınıf adı */
  esaSinifAdi?: string;
  /** CORINE Land Cover kodu (varsa, fallback) */
  corineSinifKodu?: number;
  /** Açıklama */
  aciklama: string;
  /** Veri kaynağı */
  kaynak: "esa-worldcover" | "corine-wms" | "cache" | "bilinmiyor";
  fetchedAt: number;
}

// ─── Cache ───────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 gün

function cacheKey(lat: number, lng: number): string {
  // 0.01° ≈ 1 km hassasiyet — 10m çözünürlük için yeterli
  return `arazi|${lat.toFixed(2)}|${lng.toFixed(2)}`;
}

// ─── ESA WorldCover yardımcıları ──────────────────────────────────────────────

/** ESA WorldCover sınıf kodunu AraziKategori'ye dönüştür */
function esaSinifKoduKategoriCevir(sinifKodu: number): AraziKategori {
  switch (sinifKodu) {
    case 10: return "ormanlik";  // Tree cover
    case 20: return "ormanlik";  // Shrubland
    case 30: return "mera";      // Grassland
    case 40: return "tarimsal";  // Cropland
    case 50: return "kentsel";   // Built-up
    case 60: return "cıplak";    // Bare/sparse vegetation
    case 70: return "cıplak";    // Snow and ice
    case 80: return "su";        // Permanent water bodies
    case 90: return "sulak-alan";// Herbaceous wetland
    case 95: return "sulak-alan";// Mangroves
    case 100: return "cıplak";   // Moss and lichen
    default:  return "bilinmiyor";
  }
}

/**
 * ESA WorldCover STAC API — koordinat bazlı sınıf sorgula.
 * Endpoint: https://services.terrascope.be/wms/v2
 * GetFeatureInfo ile piksel değeri çekilir.
 */
async function esaWorldcoverSorgula(
  lat: number,
  lng: number,
): Promise<{ sinifKodu: number; sinifAdi: string } | null> {
  // BBOX: koordinat çevresinde küçük bir alan
  const delta = 0.001; // ~100m
  const bbox = `${lng - delta},${lat - delta},${lng + delta},${lat + delta}`;

  const url = new URL("https://services.terrascope.be/wms/v2");
  url.searchParams.set("SERVICE", "WMS");
  url.searchParams.set("VERSION", "1.3.0");
  url.searchParams.set("REQUEST", "GetFeatureInfo");
  url.searchParams.set("LAYERS", "WORLDCOVER_2021_MAP");
  url.searchParams.set("QUERY_LAYERS", "WORLDCOVER_2021_MAP");
  url.searchParams.set("STYLES", "");
  url.searchParams.set("INFO_FORMAT", "application/json");
  url.searchParams.set("CRS", "EPSG:4326");
  url.searchParams.set("BBOX", bbox);
  url.searchParams.set("WIDTH", "1");
  url.searchParams.set("HEIGHT", "1");
  url.searchParams.set("I", "0");
  url.searchParams.set("J", "0");

  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(8000),
    headers: { "Accept": "application/json" },
  });

  if (!res.ok) return null;

  const json = await res.json() as {
    features?: Array<{ properties?: Record<string, unknown> }>;
  };

  const props = json?.features?.[0]?.properties;
  if (!props) return null;

  // ESA WorldCover yanıtında sınıf kodu "gray_index" veya "Band1" olarak gelir
  const rawKod =
    (props["gray_index"] as number | undefined) ??
    (props["Band1"] as number | undefined) ??
    null;

  if (rawKod === null || rawKod === undefined) return null;

  const sinifKodu = Number(rawKod);
  const sinifAdi = ESA_WORLDCOVER_SINIFLAR[sinifKodu] ?? `Sınıf ${sinifKodu}`;

  return { sinifKodu, sinifAdi };
}

/**
 * CORINE Land Cover WMS fallback — ESA başarısız olursa kullanılır.
 * Endpoint: Copernicus Land Monitoring Service
 * 100m çözünürlük, daha kaba ama daha stabil.
 */
async function corineWmsSorgula(
  lat: number,
  lng: number,
): Promise<{ sinifKodu: number } | null> {
  const delta = 0.005; // ~500m CORINE için yeterli
  const bbox = `${lng - delta},${lat - delta},${lng + delta},${lat + delta}`;

  const url = new URL(
    "https://image.discomap.eea.europa.eu/arcgis/services/Corine/CLC2018_WM/MapServer/WmsServer",
  );
  url.searchParams.set("SERVICE", "WMS");
  url.searchParams.set("VERSION", "1.3.0");
  url.searchParams.set("REQUEST", "GetFeatureInfo");
  url.searchParams.set("LAYERS", "0");
  url.searchParams.set("QUERY_LAYERS", "0");
  url.searchParams.set("INFO_FORMAT", "application/json");
  url.searchParams.set("CRS", "EPSG:4326");
  url.searchParams.set("BBOX", bbox);
  url.searchParams.set("WIDTH", "1");
  url.searchParams.set("HEIGHT", "1");
  url.searchParams.set("I", "0");
  url.searchParams.set("J", "0");

  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(8000),
    headers: { "Accept": "application/json" },
  });

  if (!res.ok) return null;

  const json = await res.json() as {
    features?: Array<{ properties?: { Code_18?: string | number } }>;
  };

  const rawKod = json?.features?.[0]?.properties?.["Code_18"];
  if (!rawKod) return null;

  return { sinifKodu: Number(rawKod) };
}

/** CORINE kodu → AraziKategori dönüşümü (Level-1 gruplar) */
function corineSinifKoduKategoriCevir(sinifKodu: number): AraziKategori {
  if (sinifKodu >= 100 && sinifKodu < 200) return "kentsel";    // 1xx: Yapay Yüzeyler
  if (sinifKodu >= 200 && sinifKodu < 300) return "tarimsal";   // 2xx: Tarım
  if (sinifKodu >= 300 && sinifKodu < 400) return "ormanlik";   // 3xx: Orman/Yarı-doğal
  if (sinifKodu >= 400 && sinifKodu < 500) return "sulak-alan"; // 4xx: Sulak Alan
  if (sinifKodu >= 500 && sinifKodu < 600) return "su";         // 5xx: Su Kütleleri
  return "bilinmiyor";
}

// ─── Ana API ─────────────────────────────────────────────────────────────────

/**
 * Koordinat bazlı arazi örtüsü sorgula.
 * Cache-first: 90 gün içinde aynı koordinat için sonuç varsa doğrudan döner.
 *
 * @param lat Enlem
 * @param lng Boylam
 */
export async function araziOrtusuGetir(
  lat: number,
  lng: number,
): Promise<AraziOrtusuSonuc> {
  const key = cacheKey(lat, lng);

  // Cache kontrolü
  try {
    const cached = await db.araziOrtusuCache.get(key);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return { ...cached, kaynak: "cache" };
    }
  } catch {
    // Cache erişim hatası — devam et
  }

  // 1. ESA WorldCover dene
  try {
    const esa = await esaWorldcoverSorgula(lat, lng);
    if (esa) {
      const kategori = esaSinifKoduKategoriCevir(esa.sinifKodu);
      const sonuc: AraziOrtusuSonuc = {
        kategori,
        esaSinifKodu: esa.sinifKodu,
        esaSinifAdi: esa.sinifAdi,
        aciklama: `ESA WorldCover 2021: ${esa.sinifAdi} (Sınıf ${esa.sinifKodu})`,
        kaynak: "esa-worldcover",
        fetchedAt: Date.now(),
      };
      await db.araziOrtusuCache.put({ key, ...sonuc });
      return sonuc;
    }
  } catch {
    // ESA başarısız — CORINE dene
  }

  // 2. CORINE fallback
  try {
    const corine = await corineWmsSorgula(lat, lng);
    if (corine) {
      const kategori = corineSinifKoduKategoriCevir(corine.sinifKodu);
      const sonuc: AraziOrtusuSonuc = {
        kategori,
        corineSinifKodu: corine.sinifKodu,
        aciklama: `CORINE Land Cover 2018: Sınıf ${corine.sinifKodu}`,
        kaynak: "corine-wms",
        fetchedAt: Date.now(),
      };
      await db.araziOrtusuCache.put({ key, ...sonuc });
      return sonuc;
    }
  } catch {
    // CORINE de başarısız
  }

  // 3. Her iki API de başarısız
  const fallback: AraziOrtusuSonuc = {
    kategori: "bilinmiyor",
    aciklama: "Arazi örtüsü verisi alınamadı",
    kaynak: "bilinmiyor",
    fetchedAt: Date.now(),
  };
  return fallback;
}

// ─── Fiyat çarpanı ───────────────────────────────────────────────────────────

/**
 * Arazi örtüsü fiyat çarpanı.
 *
 * Temel mantık: Parsel niteliği ile gerçek arazi örtüsü uyuşmuyorsa düzelt.
 * Örn: Nitelik "Tarla" ama arazi gerçekte "Kentsel" → büyük prim (+%30)
 *      Nitelik "Arsa" ama arazi gerçekte "Ormanlık" → ciddi ceza (-%15)
 *
 * @param araziKategori  Gerçek arazi örtüsü kategorisi
 * @param parselNitelik  TKGM parsel nitelik string'i (ör: "Tarla", "Arsa")
 */
export function araziOrtusuCarpani(
  araziKategori: AraziKategori,
  parselNitelik: string | null | undefined,
): { carpan: number; aciklama: string } {
  if (araziKategori === "bilinmiyor") {
    return { carpan: 1.0, aciklama: "Arazi örtüsü bilinmiyor — çarpan uygulanmadı" };
  }

  const nitelik = (parselNitelik ?? "").toLowerCase();
  const arsaMi = /arsa|arazi/.test(nitelik);
  const tarlaMi = /tarla|bahçe|bahce|bağ|bag|zeytinlik|mera/.test(nitelik);

  switch (araziKategori) {
    case "kentsel":
      // Kentsel arazi — en değerli
      if (tarlaMi) return { carpan: 1.30, aciklama: "Tarımsal nitelikli parsel gerçekte kentsel alanda (+%30)" };
      return { carpan: 1.08, aciklama: "Kentsel arazi örtüsü (+%8)" };

    case "tarimsal":
      // Saf tarımsal — nitelikle uyumlu
      if (arsaMi) return { carpan: 0.85, aciklama: "Arsa nitelikli parsel gerçekte tarım arazisinde (-%15)" };
      return { carpan: 1.0, aciklama: "Tarımsal arazi örtüsü — nitelikle uyumlu" };

    case "ormanlik":
      // Ormanlık — risk faktörü (yapılaşma kısıtı)
      return { carpan: 0.88, aciklama: "Ormanlık/çalılık arazi örtüsü — yapılaşma kısıtı riski (-%12)" };

    case "mera":
      // Mera — kamu arazisi riski
      return { carpan: 0.82, aciklama: "Mera arazi örtüsü — kamu arazisi dönüşüm riski (-%18)" };

    case "su":
    case "sulak-alan":
      // Su/sulak alan — ciddi kısıt
      return { carpan: 0.72, aciklama: "Su/sulak alan yakını — yapılaşma kısıtı (-%28)" };

    case "cıplak":
      // Çıplak arazi — bağlama göre değişir
      return { carpan: 0.95, aciklama: "Çıplak/seyrek arazi örtüsü (-%5)" };

    default:
      return { carpan: 1.0, aciklama: "Bilinmeyen arazi kategorisi — çarpan uygulanmadı" };
  }
}
