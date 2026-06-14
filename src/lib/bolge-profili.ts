import { getParselByLatLng, parselCacheGet, parselCacheSet } from "./tkgm-api";
import { haversineM } from "./analiz";
import type { Parsel } from "../types/tkgm";

export interface BBox {
  guneyLat: number;
  batiLng: number;
  kuzeyLat: number;
  doguLng: number;
}

export interface BolgeStats {
  parselSayisi: number;
  toplamAlanM2: number;
  ortalamaAlanM2: number;
  medyanAlanM2: number;
  enKucukAlanM2: number;
  enBuyukAlanM2: number;
  nitelikDagilimi: { nitelik: string; sayi: number; yuzde: number; toplamAlan: number }[];
  ilceDagilimi: { ilce: string; sayi: number }[];
  mahalleDagilimi: { mahalle: string; sayi: number }[];
  alanHistogram: { aralik: string; sayi: number; min: number; max: number }[];
  bbox: BBox;
  taramaSureSn: number;
  toplamSorgu: number;
  basariliSorgu: number;
  cacheHit: number;
}

export interface TaramaProgress {
  done: number;
  total: number;
  bulunan: number;
  cacheHit: number;
  current?: { lat: number; lng: number };
}

const REQUEST_DELAY_MS = 250;

/**
 * BBox içinde adaptive grid sampling.
 *
 * Önemli iyileştirmeler:
 *   1. Cache-first: parselCache'te varsa TKGM'ye sıfır çağrı
 *   2. Adaptive boundary tracking: parsel bulununca polygon bbox'ı dışına zıpla
 *      (aynı parselin onlarca kez sorgulanmasını önler)
 *   3. Resume desteği: tarama abort edildiğinde state korunur (Dexie ileride)
 *   4. Polite throttle: TKGM rate limit ihlal etmez
 */
export async function bolgeyiTara(
  bbox: BBox,
  gridSizeM: number,
  options: {
    signal?: AbortSignal;
    onProgress?: (p: TaramaProgress) => void;
  } = {},
): Promise<{
  parseller: Parsel[];
  toplamSorgu: number;
  basariliSorgu: number;
  cacheHit: number;
}> {
  const points = gridPoints(bbox, gridSizeM);
  const map = new Map<string, Parsel>();
  // "Bu parsel zaten bulundu" — bbox listesi, içine düşen sonraki noktalar atlanır
  const parselBboxlari: BBox[] = [];

  let basariliSorgu = 0;
  let cacheHit = 0;

  for (let i = 0; i < points.length; i++) {
    if (options.signal?.aborted) break;
    const p = points[i];
    if (!p) continue;

    options.onProgress?.({
      done: i,
      total: points.length,
      bulunan: map.size,
      cacheHit,
      current: p,
    });

    // 1. Adaptive: nokta bilinen bir parselin bbox'ı içindeyse atla
    if (parselBboxlari.some((b) => noktaBboxIcinde(p, b))) {
      continue;
    }

    // 2. Cache-first
    const cacheKey = `coord:${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
    let parsel: Parsel | null = null;
    try {
      parsel = await parselCacheGet(cacheKey);
      if (parsel) {
        cacheHit++;
      } else {
        parsel = await getParselByLatLng(p.lat, p.lng);
        basariliSorgu++;
        await parselCacheSet(cacheKey, parsel);
      }
    } catch {
      // Bu noktada parsel yok ya da TKGM hata — sessizce devam
      if (i < points.length - 1) {
        await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
      }
      continue;
    }

    if (parsel) {
      const key = `${parsel.mahalleKodu ?? "?"}/${parsel.adaNo}/${parsel.parselNo}`;
      if (!map.has(key)) {
        map.set(key, parsel);
        // Parselin bbox'ını adaptive listeye ekle
        const ringBbox = parselBbox(parsel);
        if (ringBbox) parselBboxlari.push(ringBbox);
      }
    }

    // TKGM'ye nazik throttle (cache hit'inde gerek yok)
    if (parsel && cacheHit === 0 && i < points.length - 1) {
      await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
    }
  }

  options.onProgress?.({
    done: points.length,
    total: points.length,
    bulunan: map.size,
    cacheHit,
  });

  return {
    parseller: [...map.values()],
    toplamSorgu: points.length,
    basariliSorgu,
    cacheHit,
  };
}

function noktaBboxIcinde(p: { lat: number; lng: number }, b: BBox): boolean {
  return (
    p.lat >= b.guneyLat &&
    p.lat <= b.kuzeyLat &&
    p.lng >= b.batiLng &&
    p.lng <= b.doguLng
  );
}

function parselBbox(parsel: Parsel): BBox | null {
  const ring = parsel.koordinatlar;
  if (ring.length < 3) return null;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const p of ring) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  return { guneyLat: minLat, kuzeyLat: maxLat, batiLng: minLng, doguLng: maxLng };
}

export function gridPoints(
  bbox: BBox,
  gridSizeM: number,
): { lat: number; lng: number }[] {
  const ortLat = (bbox.guneyLat + bbox.kuzeyLat) / 2;
  const dLat = gridSizeM / 111_111;
  const dLng = gridSizeM / (111_111 * Math.cos((ortLat * Math.PI) / 180));

  const out: { lat: number; lng: number }[] = [];
  for (let lat = bbox.guneyLat + dLat / 2; lat < bbox.kuzeyLat; lat += dLat) {
    for (let lng = bbox.batiLng + dLng / 2; lng < bbox.doguLng; lng += dLng) {
      out.push({ lat, lng });
    }
  }
  return out;
}

export function bboxAreaM2(bbox: BBox): number {
  const en = haversineM(
    (bbox.guneyLat + bbox.kuzeyLat) / 2,
    bbox.batiLng,
    (bbox.guneyLat + bbox.kuzeyLat) / 2,
    bbox.doguLng,
  );
  const boy = haversineM(
    bbox.guneyLat,
    (bbox.batiLng + bbox.doguLng) / 2,
    bbox.kuzeyLat,
    (bbox.batiLng + bbox.doguLng) / 2,
  );
  return en * boy;
}

export function statsHesapla(
  parseller: Parsel[],
  bbox: BBox,
  toplamSorgu: number,
  basariliSorgu: number,
  cacheHit: number,
  sureSn: number,
): BolgeStats {
  if (parseller.length === 0) {
    return {
      parselSayisi: 0,
      toplamAlanM2: 0,
      ortalamaAlanM2: 0,
      medyanAlanM2: 0,
      enKucukAlanM2: 0,
      enBuyukAlanM2: 0,
      nitelikDagilimi: [],
      ilceDagilimi: [],
      mahalleDagilimi: [],
      alanHistogram: [],
      bbox,
      taramaSureSn: sureSn,
      toplamSorgu,
      basariliSorgu,
      cacheHit,
    };
  }

  const alanlar = parseller.map((p) => p.alan).sort((a, b) => a - b);
  const toplam = alanlar.reduce((s, a) => s + a, 0);
  const medyan =
    alanlar.length % 2 === 0
      ? ((alanlar[alanlar.length / 2 - 1] ?? 0) + (alanlar[alanlar.length / 2] ?? 0)) / 2
      : alanlar[Math.floor(alanlar.length / 2)] ?? 0;

  // Nitelik dağılımı (parsel sayısı + toplam alan)
  const nitelikMap = new Map<string, { sayi: number; toplamAlan: number }>();
  for (const p of parseller) {
    const k = (p.nitelik || "—").trim();
    const cur = nitelikMap.get(k) ?? { sayi: 0, toplamAlan: 0 };
    cur.sayi++;
    cur.toplamAlan += p.alan;
    nitelikMap.set(k, cur);
  }
  const nitelikDagilimi = [...nitelikMap.entries()]
    .sort(([, a], [, b]) => b.sayi - a.sayi)
    .map(([k, v]) => ({
      nitelik: k,
      sayi: v.sayi,
      yuzde: Math.round((v.sayi / parseller.length) * 1000) / 10,
      toplamAlan: Math.round(v.toplamAlan),
    }));

  // İlçe / Mahalle dağılımı
  const ilceMap = new Map<string, number>();
  const mahalleMap = new Map<string, number>();
  for (const p of parseller) {
    if (p.ilceAd) ilceMap.set(p.ilceAd, (ilceMap.get(p.ilceAd) ?? 0) + 1);
    if (p.mahalleAd) mahalleMap.set(p.mahalleAd, (mahalleMap.get(p.mahalleAd) ?? 0) + 1);
  }
  const ilceDagilimi = [...ilceMap.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([k, v]) => ({ ilce: k, sayi: v }));
  const mahalleDagilimi = [...mahalleMap.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([k, v]) => ({ mahalle: k, sayi: v }));

  // Alan histogramı — log-scale gruplar
  const histogramAraliklari = [
    { min: 0, max: 200, label: "<200 m²" },
    { min: 200, max: 500, label: "200-500 m²" },
    { min: 500, max: 1000, label: "500m²-1k" },
    { min: 1000, max: 2500, label: "1k-2.5k m²" },
    { min: 2500, max: 5000, label: "2.5k-5k m²" },
    { min: 5000, max: 10000, label: "5k-10k m² (1ha)" },
    { min: 10000, max: 50000, label: "1-5 ha" },
    { min: 50000, max: Infinity, label: ">5 ha" },
  ];
  const alanHistogram = histogramAraliklari.map((a) => ({
    aralik: a.label,
    sayi: parseller.filter((p) => p.alan >= a.min && p.alan < a.max).length,
    min: a.min,
    max: a.max,
  }));

  return {
    parselSayisi: parseller.length,
    toplamAlanM2: Math.round(toplam),
    ortalamaAlanM2: Math.round(toplam / parseller.length),
    medyanAlanM2: Math.round(medyan),
    enKucukAlanM2: Math.round(alanlar[0] ?? 0),
    enBuyukAlanM2: Math.round(alanlar[alanlar.length - 1] ?? 0),
    nitelikDagilimi,
    ilceDagilimi,
    mahalleDagilimi,
    alanHistogram,
    bbox,
    taramaSureSn: sureSn,
    toplamSorgu,
    basariliSorgu,
    cacheHit,
  };
}

// Nitelik renk paleti — dağılım pie chart + polygon renkleri için
export const NITELIK_RENKLERI: { pattern: RegExp; renk: string; ikon: string }[] = [
  { pattern: /arsa/i, renk: "#3b82f6", ikon: "🟦" },
  { pattern: /tarla/i, renk: "#a3e635", ikon: "🌾" },
  { pattern: /bahçe|bahce/i, renk: "#84cc16", ikon: "🌳" },
  { pattern: /bağ\b|bag\b/iu, renk: "#a855f7", ikon: "🍇" },
  { pattern: /zeytin/i, renk: "#65a30d", ikon: "🫒" },
  { pattern: /mesken|bina|işyeri|isyeri/i, renk: "#ef4444", ikon: "🏢" },
  { pattern: /yol/i, renk: "#737373", ikon: "🛣️" },
  { pattern: /su|göl|gol|deniz/i, renk: "#06b6d4", ikon: "💧" },
];

export function nitelikRenkBul(nitelik: string): { renk: string; ikon: string } {
  for (const n of NITELIK_RENKLERI) {
    if (n.pattern.test(nitelik)) return { renk: n.renk, ikon: n.ikon };
  }
  return { renk: "#94a3b8", ikon: "📄" };
}
