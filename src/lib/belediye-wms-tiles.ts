/**
 * Belediye imar haritası — MapLibre raster tile URL şablonları.
 * Pilot: İstanbul İBB ArcGIS MapServer (PLAN 1000 / 5000).
 * OGC SPA endpoint (sehirharitasi … GoruntulemeOGCService) GetCapabilities vermiyor.
 */

export type BelediyeHaritaMod = "arcgis-export" | "wms" | "deep-link";

export interface BelediyeWmsKaynak {
  ilNorm: string;
  ad: string;
  mod: BelediyeHaritaMod;
  /** ArcGIS MapServer root veya WMS GetMap base */
  getMapBase: string;
  /** ArcGIS: "show:13,14" | WMS: layer name */
  layers: string;
  attribution: string;
  /** Deep-link yedek (tile yoksa / hata durumunda) */
  portalUrl?: string;
  version?: "1.1.1" | "1.3.0";
}

/** Pilot kaynaklar */
export const BELEDIYE_WMS_KAYNAKLARI: BelediyeWmsKaynak[] = [
  {
    ilNorm: "istanbul",
    ad: "İBB Plan (1/1000–1/5000)",
    mod: "arcgis-export",
    getMapBase:
      "https://cbsmapws.ibb.gov.tr/arcgis/rest/services/KAZI_RUHSAT/QueryMap/MapServer/export",
    // 13 = PLAN 1000 Alan, 14 = PLAN 1000 Mozaik, 12 = PLAN 5000 Alan
    layers: "show:12,13,14",
    attribution: "© İBB CBS",
    portalUrl: "https://sehirharitasi.ibb.gov.tr",
  },
];

/** WMS yok ama portal deep-link var — MapView’da “yeni sekme” */
export interface BelediyeDeepLink {
  ilNorm: string;
  ad: string;
  url: string;
}

export const BELEDIYE_DEEP_LINKS: BelediyeDeepLink[] = [
  { ilNorm: "ankara", ad: "ABB e-İmar", url: "https://eimar.ankara.bel.tr" },
  { ilNorm: "izmir", ad: "İzmir CBS", url: "https://cbs.izmir.bel.tr" },
  { ilNorm: "bursa", ad: "Bursa e-İmar", url: "https://eimar.bursa.bel.tr" },
  { ilNorm: "antalya", ad: "Antalya İmar Sorgu", url: "https://imarsorgu.antalya.bel.tr" },
];

export function normalizeIlAd(ilAd: string | null | undefined): string | null {
  if (!ilAd) return null;
  return ilAd
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/\s+/g, "");
}

export function belediyeWmsKaynakBul(ilAd: string | null | undefined): BelediyeWmsKaynak | null {
  const norm = normalizeIlAd(ilAd);
  if (!norm) return null;
  return BELEDIYE_WMS_KAYNAKLARI.find((k) => k.ilNorm === norm) ?? null;
}

export function belediyeDeepLinkBul(ilAd: string | null | undefined): BelediyeDeepLink | null {
  const norm = normalizeIlAd(ilAd);
  if (!norm) return null;
  // WMS varsa deep-link yedek olarak portalUrl kullanılır
  const wms = BELEDIYE_WMS_KAYNAKLARI.find((k) => k.ilNorm === norm);
  if (wms?.portalUrl) return { ilNorm: norm, ad: wms.ad, url: wms.portalUrl };
  return BELEDIYE_DEEP_LINKS.find((k) => k.ilNorm === norm) ?? null;
}

function wmsGetMapQuery(kaynak: BelediyeWmsKaynak): string {
  const version = kaynak.version ?? "1.3.0";
  const crsKey = version === "1.3.0" ? "CRS" : "SRS";
  return new URLSearchParams({
    SERVICE: "WMS",
    VERSION: version,
    REQUEST: "GetMap",
    FORMAT: "image/png",
    TRANSPARENT: "true",
    LAYERS: kaynak.layers,
    [crsKey]: "EPSG:3857",
    STYLES: "",
    WIDTH: "256",
    HEIGHT: "256",
  }).toString();
}

/** MapLibre raster tiles — BBOX template */
export function belediyeWmsTileUrls(kaynak: BelediyeWmsKaynak): string[] {
  if (kaynak.mod === "deep-link") return [];

  if (kaynak.mod === "arcgis-export") {
    const q = new URLSearchParams({
      bboxSR: "3857",
      imageSR: "3857",
      size: "256,256",
      dpi: "96",
      format: "png32",
      transparent: "true",
      layers: kaynak.layers,
      f: "image",
    }).toString();
    const sep = kaynak.getMapBase.includes("?") ? "&" : "?";
    return [`${kaynak.getMapBase}${sep}${q}&bbox={bbox-epsg-3857}`];
  }

  const q = wmsGetMapQuery(kaynak);
  const sep = kaynak.getMapBase.includes("?") ? "&" : "?";
  return [`${kaynak.getMapBase}${sep}${q}&BBOX={bbox-epsg-3857}`];
}
