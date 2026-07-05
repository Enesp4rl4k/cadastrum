/**
 * TUCBS ÇDP WMS — MapLibre raster tile URL şablonları.
 */

import { TUCBS_WMS_BASE } from "./data/tucbs-wms-endpoints";

const API_BASE = "https://cadastrum-api.cadastrum-tr.workers.dev/v1";

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

/** Cloudflare proxy üzerinden (CORS fallback) */
export function cdpWmsTileUrlProxy(wmsSlug: string): string {
  return (
    `${API_BASE}/proxy/tucbs/tile?wms=${encodeURIComponent(wmsSlug)}` +
    `&bbox={bbox-epsg-3857}`
  );
}

/** MapLibre raster source tiles — doğrudan CSB WMS (extension host_permissions) */
export function cdpWmsTileUrls(wmsSlug: string): string[] {
  return [cdpWmsTileUrlDirect(wmsSlug)];
}
