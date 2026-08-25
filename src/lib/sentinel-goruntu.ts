/**
 * sentinel-goruntu.ts — Copernicus Data Space Ecosystem üzerinden uydu görüntüsü.
 *
 * Copernicus Data Space (dataspace.copernicus.eu) ücretsiz açık veri:
 *   - Sentinel-2 L2A (10m çözünürlük, atmosfer düzeltmeli)
 *   - OGC WMS endpoint: ücretsiz, kayıt gerektirmez
 *   - NDVI, gerçek renk, yanlış renk bant kombinasyonları
 *
 * Kullanım:
 *   const gorsel = await sentinelGorselGetir({ lat, lng, zoom, bant });
 *   // → base64 PNG veya URL
 *
 * Backend proxy gerekli: Extension'dan Sentinel API'ye direkt CORS yok.
 * Backend /v1/uydu/gorsel endpoint'i üzerinden istek yapılır.
 *
 * Cache: Dexie `uydugOrselCache` — 30 gün TTL
 * (Sentinel görüntüsü nadiren değişir, bulut örtüsü dışında)
 */

import { BACKEND_API } from "./api-constants";

export type SentinelBant =
  | "gercek-renk"    // RGB — TCI (True Color Image)
  | "ndvi"           // Normalized Difference Vegetation Index — bitkisel örtü
  | "yanlis-renk"    // False color (NIR-Red-Green) — bitki sağlığı
  | "nem";           // SWIR kombinasyonu — nem/sulama

export interface SentinelGorselSonuc {
  /** Base64 PNG verisi (data:image/png;base64,...) */
  base64: string;
  /** Görüntü bant tipi */
  bant: SentinelBant;
  /** Görüntü tarihi (en yakın bulutsuz) */
  gorselTarihi: string | null;
  /** Bulut örtüsü yüzdesi (0-100) */
  bulutOrtYuzde: number | null;
  /** Görüntü çözünürlüğü (m/piksel) */
  cozunurlukM: number;
  /** Alınan koordinat bbox */
  bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number };
  fetchedAt: number;
}

export interface SentinelAnalizSonuc {
  gorsel: SentinelGorselSonuc;
  /** Gemini Vision AI analiz özeti */
  aiOzet: string | null;
  /** Tespit edilen arazi özellikleri */
  araziBulgu: {
    bitkilik: "yok" | "az" | "orta" | "yoğun";
    yapilaşma: "yok" | "seyrek" | "orta" | "yoğun";
    su: boolean;
    tarimAlan: boolean;
    acikArazi: boolean;
  } | null;
  /** Fiyata olası etki */
  fiyatNotu: string | null;
}

// Cache — in-memory (Dexie entegrasyonu ileride eklenebilir)
const GORSEL_CACHE = new Map<string, { data: SentinelGorselSonuc; ts: number }>();
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 gün

function cacheKey(lat: number, lng: number, bant: SentinelBant): string {
  return `sentinel|${lat.toFixed(3)}|${lng.toFixed(3)}|${bant}`;
}

/**
 * Koordinat etrafında bbox hesapla.
 * zoom=13 → ~500m yarıçap, zoom=15 → ~150m yarıçap
 */
function bboxHesapla(
  lat: number,
  lng: number,
  yaricapM = 400,
): { minLat: number; maxLat: number; minLng: number; maxLng: number } {
  const dLat = yaricapM / 111_000;
  const dLng = yaricapM / (111_000 * Math.cos((lat * Math.PI) / 180));
  return {
    minLat: lat - dLat,
    maxLat: lat + dLat,
    minLng: lng - dLng,
    maxLng: lng + dLng,
  };
}

/**
 * Backend proxy üzerinden Sentinel-2 görüntüsü al.
 * Backend /v1/uydu/gorsel endpoint'i Sentinel WMS'i çağırır + base64 döner.
 */
export async function sentinelGorselGetir(
  lat: number,
  lng: number,
  bant: SentinelBant = "gercek-renk",
  yaricapM = 400,
  signal?: AbortSignal,
): Promise<SentinelGorselSonuc | null> {
  if (!lat || !lng || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < 35 || lat > 43 || lng < 25 || lng > 46) return null;

  const key = cacheKey(lat, lng, bant);
  const cached = GORSEL_CACHE.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.data;
  }

  const bbox = bboxHesapla(lat, lng, yaricapM);

  try {
    const res = await fetch(`${BACKEND_API}/uydu/gorsel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat, lng, bant, bbox }),
      signal,
    });

    if (!res.ok) return null;

    const data = await res.json() as SentinelGorselSonuc;
    if (!data.base64) return null;

    GORSEL_CACHE.set(key, { data, ts: Date.now() });
    return data;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") return null;
    return null;
  }
}

/**
 * Görüntü + Gemini Vision AI analizi — backend üzerinden.
 * JWT gerektirmez (Pro tier kontrolü backend'de).
 */
export async function sentinelAnalizGetir(
  lat: number,
  lng: number,
  bant: SentinelBant = "gercek-renk",
  jwt?: string | null,
  signal?: AbortSignal,
): Promise<SentinelAnalizSonuc | null> {
  if (!lat || !lng) return null;

  try {
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (jwt) headers["Authorization"] = `Bearer ${jwt}`;

    const res = await fetch(`${BACKEND_API}/uydu/analiz`, {
      method: "POST",
      headers,
      body: JSON.stringify({ lat, lng, bant }),
      signal,
    });

    if (!res.ok) return null;
    return await res.json() as SentinelAnalizSonuc;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") return null;
    return null;
  }
}

/** Bant açıklaması */
export function bantAciklamasi(bant: SentinelBant): string {
  switch (bant) {
    case "gercek-renk":  return "Gerçek Renk (RGB)";
    case "ndvi":         return "Bitki Örtüsü (NDVI)";
    case "yanlis-renk":  return "Bitki Sağlığı (NIR)";
    case "nem":          return "Nem & Sulama (SWIR)";
  }
}

/** Bant tooltip açıklaması */
export function bantIpucu(bant: SentinelBant): string {
  switch (bant) {
    case "gercek-renk":
      return "İnsan gözüne benzer görüntü. Yapı, yol, arazi kullanımı tespiti.";
    case "ndvi":
      return "Koyu yeşil = yoğun bitki örtüsü. Kırmızı/sarı = çıplak/kuru arazi.";
    case "yanlis-renk":
      return "Kızılötesi bant. Sağlıklı bitki = parlak kırmızı. Tarım sınıflandırması.";
    case "nem":
      return "SWIR-NIR kombinasyonu. Mavi = nemli/sulak. Kahverengi = kuru.";
  }
}
