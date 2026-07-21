/**
 * Belediye uygulama imar WMS — MapLibre raster overlay (pilot İBB).
 */

import type { Map as MapLibreMap } from "maplibre-gl";
import {
  belediyeWmsKaynakBul,
  belediyeWmsTileUrls,
  type BelediyeWmsKaynak,
} from "../../lib/belediye-wms-tiles";

export const BEL_WMS_SRC = "belediye-imar-wms-src";
export const BEL_WMS_LAYER = "belediye-imar-wms-layer";

const DEFAULT_OPACITY = 0.5;

function layerBeforeParsel(map: MapLibreMap): string | undefined {
  if (map.getLayer("parsel-fill")) return "parsel-fill";
  if (map.getLayer("tucbs-cdp-wms-layer")) return "tucbs-cdp-wms-layer";
  return undefined;
}

export function applyBelediyeWms(
  map: MapLibreMap | null,
  kaynak: BelediyeWmsKaynak,
  opacity = DEFAULT_OPACITY,
): void {
  if (!map || !kaynak) return;

  const apply = () => {
    removeBelediyeWms(map);

    map.addSource(BEL_WMS_SRC, {
      type: "raster",
      tiles: belediyeWmsTileUrls(kaynak),
      tileSize: 256,
      attribution: kaynak.attribution,
    });

    map.addLayer(
      {
        id: BEL_WMS_LAYER,
        type: "raster",
        source: BEL_WMS_SRC,
        paint: {
          "raster-opacity": opacity,
          "raster-fade-duration": 200,
        },
      },
      layerBeforeParsel(map),
    );
  };

  if (map.isStyleLoaded()) apply();
  else map.once("load", apply);
}

export function removeBelediyeWms(map: MapLibreMap | null): void {
  if (!map) return;
  if (map.getLayer(BEL_WMS_LAYER)) map.removeLayer(BEL_WMS_LAYER);
  if (map.getSource(BEL_WMS_SRC)) map.removeSource(BEL_WMS_SRC);
}

export function setBelediyeWmsOpacity(map: MapLibreMap | null, opacity: number): void {
  if (!map?.getLayer(BEL_WMS_LAYER)) return;
  map.setPaintProperty(BEL_WMS_LAYER, "raster-opacity", opacity);
}

export { belediyeWmsKaynakBul };
