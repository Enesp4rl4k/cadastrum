/**
 * TUCBS ÇDP WMS — MapLibre raster tile URL şablonları.
 */

import { TUCBS_WMS_BASE } from "./data/tucbs-wms-endpoints";

import { BACKEND_API as API_BASE } from "./api-constants";

/** WMS GetMap — katman 2 (ARAZIKULLANIMI RENK) */
export const CDP_WMS_LAYER_ID = "2";

function getMapQuery(): string {
  return new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.3.0",
    REQUEST: "GetMap",
    FORMAT: "image/png",
    TRANSPARENT: "true",
    LAYERS: CDP_WMS_LAYER_ID,
    CRS: "EPSG:3857",
    STYLES: "",
    WIDTH: "256",
    HEIGHT: "256",
  }).toString();
}

/** Doğrudan CSB WMS — extension host_permissions ile */
export function cdpWmsTileUrlDirect(wmsSlug: string): string {
  return `${TUCBS_WMS_BASE}/${wmsSlug}?${getMapQuery()}&BBOX={bbox-epsg-3857}`;
}

/**
 * Cloudflare proxy üzerinden (CORS fallback).
 *
 * SÖZLEŞME DÜZELTMESİ: burada eskiden `?wms=..&bbox=..` query biçimi vardı ama
 * backend rotası PATH parametreli: `/proxy/tucbs/tile/:wms/:z/:x/:y`
 * (routes/proxy.ts:215). Ölçüldü — query biçimi 404 dönüyordu. Fonksiyonun
 * hiç çağıranı olmadığı için (site ve uzantı doğrudan CSB WMS'e gidiyor,
 * bkz. cdpWmsTileUrls) fark edilmemişti; R2 tile cache bu yüzden hiç
 * beslenmiyor.
 *
 * MapLibre {z}/{x}/{y} yer tutucularını kendisi dolduruyor.
 */
export function cdpWmsTileUrlProxy(wmsSlug: string): string {
  return `${API_BASE}/proxy/tucbs/tile/${encodeURIComponent(wmsSlug)}/{z}/{x}/{y}`;
}

/** MapLibre raster source tiles — doğrudan CSB WMS (extension host_permissions) */
export function cdpWmsTileUrls(wmsSlug: string): string[] {
  return [cdpWmsTileUrlDirect(wmsSlug)];
}
