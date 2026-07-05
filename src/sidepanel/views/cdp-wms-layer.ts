/**
 * TUCBS Çevre Düzeni Planı — MapLibre WMS raster overlay.
 */

import type { Map as MapLibreMap } from "maplibre-gl";
import { cdpWmsTileUrls } from "../../lib/tucbs-wms-tiles";

export const CDP_WMS_SRC = "tucbs-cdp-wms-src";
export const CDP_WMS_LAYER = "tucbs-cdp-wms-layer";

const DEFAULT_OPACITY = 0.55;

function layerBeforeParsel(map: MapLibreMap): string | undefined {
  if (map.getLayer("parsel-fill")) return "parsel-fill";
  return undefined;
}

export function applyCdpWms(
  map: MapLibreMap | null,
  wmsSlug: string,
  opacity = DEFAULT_OPACITY,
): void {
  if (!map || !wmsSlug) return;

  const apply = () => {
    removeCdpWms(map);

    map.addSource(CDP_WMS_SRC, {
      type: "raster",
      tiles: cdpWmsTileUrls(wmsSlug),
      tileSize: 256,
      attribution: "© TUCBS / CSB",
    });

    map.addLayer(
      {
        id: CDP_WMS_LAYER,
        type: "raster",
        source: CDP_WMS_SRC,
        paint: {
          "raster-opacity": opacity,
          "raster-fade-duration": 200,
        },
      },
      layerBeforeParsel(map),
    );
  };

  if (map.isStyleLoaded()) {
    apply();
  } else {
    map.once("load", apply);
  }
}

export function removeCdpWms(map: MapLibreMap | null): void {
  if (!map) return;
  if (map.getLayer(CDP_WMS_LAYER)) map.removeLayer(CDP_WMS_LAYER);
  if (map.getSource(CDP_WMS_SRC)) map.removeSource(CDP_WMS_SRC);
}

export function setCdpWmsOpacity(map: MapLibreMap | null, opacity: number): void {
  if (!map?.getLayer(CDP_WMS_LAYER)) return;
  map.setPaintProperty(CDP_WMS_LAYER, "raster-opacity", opacity);
}
