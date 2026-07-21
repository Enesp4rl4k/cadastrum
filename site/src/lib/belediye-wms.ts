/**
 * Site — belediye imar raster (pilot: İBB ArcGIS export).
 * Extension belediye-wms-tiles ile aynı kaynak; TKGM/ada-parsel yok.
 */

export interface BelediyeWmsKaynak {
  ilNorm: string;
  ad: string;
  getMapBase: string;
  layers: string;
  attribution: string;
  portalUrl: string;
}

export const IBB_PLAN: BelediyeWmsKaynak = {
  ilNorm: "istanbul",
  ad: "İBB Plan (1/1000–1/5000)",
  getMapBase:
    "https://cbsmapws.ibb.gov.tr/arcgis/rest/services/KAZI_RUHSAT/QueryMap/MapServer/export",
  layers: "show:12,13,14",
  attribution: "© İBB CBS",
  portalUrl: "https://sehirharitasi.ibb.gov.tr",
};

export const BELEDIYE_PORTALLAR: Array<{ ilNorm: string; ad: string; url: string }> = [
  { ilNorm: "istanbul", ad: "İBB Şehir Haritası", url: "https://sehirharitasi.ibb.gov.tr" },
  { ilNorm: "ankara", ad: "ABB e-İmar", url: "https://eimar.ankara.bel.tr" },
  { ilNorm: "izmir", ad: "İzmir CBS", url: "https://cbs.izmir.bel.tr" },
  { ilNorm: "bursa", ad: "Bursa e-İmar", url: "https://eimar.bursa.bel.tr" },
  { ilNorm: "antalya", ad: "Antalya İmar Sorgu", url: "https://imarsorgu.antalya.bel.tr" },
];

export function belediyePortalIlIcin(ilNorm: string | null | undefined) {
  if (!ilNorm) return null;
  const key = ilNorm.toLocaleLowerCase("tr").replace(/\s+/g, "");
  return BELEDIYE_PORTALLAR.find((p) => p.ilNorm === key) ?? null;
}

/** MapLibre raster tile URL — bbox-epsg-3857 şablonu */
export function ibbPlanTileUrl(): string {
  const q = new URLSearchParams({
    bboxSR: "3857",
    imageSR: "3857",
    size: "256,256",
    dpi: "96",
    format: "png32",
    transparent: "true",
    layers: IBB_PLAN.layers,
    f: "image",
  }).toString();
  return `${IBB_PLAN.getMapBase}?${q}&bbox={bbox-epsg-3857}`;
}
