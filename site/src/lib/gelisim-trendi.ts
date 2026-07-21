/**
 * Uydu gelişim trendi — Esri Wayback yıllık karelerden built-up proxy skoru.
 *
 * Metrik (basit, açıklanabilir):
 *   - builtUp: yüksek parlaklık + düşük yeşil baskınlık (beton/çatı proxy)
 *   - veg: yeşil kanal baskınlığı
 * Erken yıllar vs son yıllar farkı → skor (-100…+100)
 */

export const GELISIM_YILLAR: Array<{ yil: number; releaseId: number }> = [
  { yil: 2014, releaseId: 10 },
  { yil: 2017, releaseId: 36 },
  { yil: 2020, releaseId: 60 },
  { yil: 2024, releaseId: 92 },
];

export const WAYBACK_EXPORT_BASE =
  "https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/export";

export interface GelisimBbox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export interface YilMetrik {
  yil: number;
  releaseId: number;
  builtUp: number; // 0–1
  veg: number; // 0–1
  lum: number; // 0–1
}

export type GelisimGuven = "dusuk" | "orta" | "yuksek";

export interface GelisimTrendiSonuc {
  skor: number; // -100…+100 (+ = yapılaşma artışı)
  etiket: string;
  aciklama: string;
  yillar: YilMetrik[];
  oncekiYil: number;
  sonrakiYil: number;
  guven: GelisimGuven;
  deltaBuiltUp: number;
  deltaVeg: number;
}

export function bboxFromKoordinatlar(
  coords: Array<{ lat: number; lng: number }>,
  padOran = 0.45,
): GelisimBbox | null {
  const ring = coords.filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (ring.length < 3) return null;
  const lats = ring.map((p) => p.lat);
  const lngs = ring.map((p) => p.lng);
  let minLat = Math.min(...lats);
  let maxLat = Math.max(...lats);
  let minLng = Math.min(...lngs);
  let maxLng = Math.max(...lngs);
  const padLat = (maxLat - minLat || 0.0006) * padOran;
  const padLng = (maxLng - minLng || 0.0006) * padOran;
  return {
    minLat: minLat - padLat,
    maxLat: maxLat + padLat,
    minLng: minLng - padLng,
    maxLng: maxLng + padLng,
  };
}

/** Merkez + yaklaşık yarıçap (m) ile bbox — site sorgu için */
export function bboxFromMerkez(lat: number, lng: number, yaricapM = 180): GelisimBbox {
  const dLat = yaricapM / 111_320;
  const dLng = yaricapM / (111_320 * Math.cos((lat * Math.PI) / 180));
  return {
    minLat: lat - dLat,
    maxLat: lat + dLat,
    minLng: lng - dLng,
    maxLng: lng + dLng,
  };
}

export function waybackExportUrl(
  bbox: GelisimBbox,
  releaseId: number,
  w = 160,
  h = 120,
): string {
  const b = `${bbox.minLng.toFixed(6)},${bbox.minLat.toFixed(6)},${bbox.maxLng.toFixed(6)},${bbox.maxLat.toFixed(6)}`;
  return (
    `${WAYBACK_EXPORT_BASE}` +
    `?bbox=${b}&bboxSR=4326&imageSR=4326` +
    `&size=${w},${h}&format=jpg&f=image&time=${releaseId}`
  );
}

function metrikFromImageData(data: ImageData): { builtUp: number; veg: number; lum: number } {
  const px = data.data;
  let built = 0;
  let veg = 0;
  let lumSum = 0;
  const n = data.width * data.height;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i]!;
    const g = px[i + 1]!;
    const b = px[i + 2]!;
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    lumSum += lum;
    const maxc = Math.max(r, g, b);
    const minc = Math.min(r, g, b);
    const sat = maxc === 0 ? 0 : (maxc - minc) / maxc;
    // Beton / çatı proxy: parlak + düşük doygunluk
    if (lum > 0.42 && sat < 0.28) built++;
    // Bitki proxy: yeşil baskın
    if (g > r + 8 && g > b + 8 && g > 60) veg++;
  }
  return {
    builtUp: built / n,
    veg: veg / n,
    lum: lumSum / n,
  };
}

async function imageDataFromBlob(blob: Blob): Promise<ImageData> {
  const bmp = await createImageBitmap(blob);
  try {
    const canvas = typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(bmp.width, bmp.height)
      : Object.assign(document.createElement("canvas"), { width: bmp.width, height: bmp.height });
    const ctx = (canvas as OffscreenCanvas).getContext("2d")
      ?? (canvas as HTMLCanvasElement).getContext("2d");
    if (!ctx) throw new Error("Canvas 2d yok");
    ctx.drawImage(bmp, 0, 0);
    return ctx.getImageData(0, 0, bmp.width, bmp.height);
  } finally {
    bmp.close();
  }
}

export function skorlaMetrikler(yillar: YilMetrik[]): GelisimTrendiSonuc {
  if (yillar.length < 2) {
    return {
      skor: 0,
      etiket: "Yetersiz veri",
      aciklama: "Karşılaştırma için en az iki yıllık uydu karesi gerekir.",
      yillar,
      oncekiYil: yillar[0]?.yil ?? 0,
      sonrakiYil: yillar[yillar.length - 1]?.yil ?? 0,
      guven: "dusuk",
      deltaBuiltUp: 0,
      deltaVeg: 0,
    };
  }

  const erken = yillar.slice(0, Math.ceil(yillar.length / 2));
  const gec = yillar.slice(-Math.ceil(yillar.length / 2));
  const avg = (arr: YilMetrik[], key: keyof YilMetrik) =>
    arr.reduce((s, y) => s + (y[key] as number), 0) / arr.length;

  const b0 = avg(erken, "builtUp");
  const b1 = avg(gec, "builtUp");
  const v0 = avg(erken, "veg");
  const v1 = avg(gec, "veg");
  const deltaBuiltUp = b1 - b0;
  const deltaVeg = v1 - v0;

  // Yapılaşma artışı + yeşil azalışı → kentleşme sinyali (−100…+100)
  // Örn. builtUp +0.25 ≈ +75; veg −0.15 ≈ +30 ek katkı
  let skor = Math.round(deltaBuiltUp * 300 - deltaVeg * 200);
  skor = Math.max(-100, Math.min(100, skor));

  const oncekiYil = yillar[0]!.yil;
  const sonrakiYil = yillar[yillar.length - 1]!.yil;

  let etiket: string;
  let aciklama: string;
  if (skor >= 35) {
    etiket = "Hızlı yapılaşma";
    aciklama = `${oncekiYil}–${sonrakiYil} arasında uydu karelerinde yapay yüzey artışı belirgin; çevrede gelişim baskısı yüksek görünüyor.`;
  } else if (skor >= 12) {
    etiket = "Orta gelişim";
    aciklama = `${oncekiYil}–${sonrakiYil} döneminde ılımlı yapılaşma / yüzey değişimi izleniyor.`;
  } else if (skor > -12) {
    etiket = "Durağan";
    aciklama = `${oncekiYil}–${sonrakiYil} arasında uydu görünümünde belirgin kentleşme sinyali yok.`;
  } else if (skor > -35) {
    etiket = "Azalan yapılaşma sinyali";
    aciklama = `Son yıllarda yapay yüzey oranı görece düşmüş veya yeşil örtü artmış olabilir (yeniden doğal örtü / tarım).`;
  } else {
    etiket = "Yeşil / doğal artış";
    aciklama = `${oncekiYil}–${sonrakiYil} karelerinde bitki örtüsü artışı veya yapılaşma azalması sinyali var.`;
  }

  const guven: GelisimGuven =
    yillar.length >= 4 && Math.abs(deltaBuiltUp) + Math.abs(deltaVeg) > 0.04
      ? "yuksek"
      : yillar.length >= 3
        ? "orta"
        : "dusuk";

  return {
    skor,
    etiket,
    aciklama,
    yillar,
    oncekiYil,
    sonrakiYil,
    guven,
    deltaBuiltUp,
    deltaVeg,
  };
}

export type ImageFetcher = (url: string, releaseId: number) => Promise<Blob>;

/** Client-side analiz — fetcher ile Esri veya API proxy */
export async function gelisimTrendiAnaliz(
  bbox: GelisimBbox,
  fetchImage: ImageFetcher,
  yillar: typeof GELISIM_YILLAR = GELISIM_YILLAR,
): Promise<GelisimTrendiSonuc> {
  const metrikler: YilMetrik[] = [];
  for (const y of yillar) {
    const url = waybackExportUrl(bbox, y.releaseId);
    const blob = await fetchImage(url, y.releaseId);
    const img = await imageDataFromBlob(blob);
    const m = metrikFromImageData(img);
    metrikler.push({ yil: y.yil, releaseId: y.releaseId, ...m });
  }
  return skorlaMetrikler(metrikler);
}

export function gelisimSkorRenk(skor: number): string {
  if (skor >= 35) return "#059669"; // emerald
  if (skor >= 12) return "#0284c7"; // sky
  if (skor > -12) return "#64748b"; // slate
  if (skor > -35) return "#d97706"; // amber
  return "#16a34a"; // green
}
