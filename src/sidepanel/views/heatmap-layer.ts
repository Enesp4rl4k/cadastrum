/**
 * TKGM analiz noktaları için MapLibre heatmap + circle layer'ı.
 * LabView ve MapView ortak kullanır — kod tekrarını önler.
 *
 * Düşük zoom'da heatmap (bulut), yüksek zoom'da circle (parsel detayı).
 */

import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import type { AnalizNoktasi, AnalizTip } from "../../lib/tkgm-analiz";
import { analizNoktalariGeoJson } from "../../lib/viz";

/** Analiz tipi başına ana renk — circle layer ve UI için */
export const HEAT_TIP_RENKLERI: Record<AnalizTip, string> = {
  1: "#7c3aed", // satış sayısı (mor)
  2: "#0d9488", // ipotek (teal)
  3: "#dc2626", // haciz (kırmızı)
  4: "#0891b2", // şerh (mavi)
  5: "#ea580c", // diğer (turuncu)
};

export const HEAT_SRC = "tkgm-heat-src";
export const HEAT_LAYER = "tkgm-heat-layer";
export const HEAT_LAYER_CLOUD = `${HEAT_LAYER}-cloud`;

interface ApplyHeatmapOptions {
  /** Verilen noktaların bbox'ına uç (LabView için true, MapView için false) */
  fitBounds?: boolean;
}

export function applyHeatmap(
  map: MapLibreMap | null,
  noktalar: AnalizNoktasi[],
  analizTip: AnalizTip,
  options: ApplyHeatmapOptions = {},
): void {
  if (!map) return;

  const data = analizNoktalariGeoJson(noktalar);
  const renk = HEAT_TIP_RENKLERI[analizTip];
  const maxSayi = Math.max(...noktalar.map((n) => n.sayi), 1);

  const setOrCreate = () => {
    const src = map.getSource(HEAT_SRC) as maplibregl.GeoJSONSource | undefined;
    if (src) {
      src.setData(data);
      if (map.getLayer(HEAT_LAYER)) {
        map.setPaintProperty(HEAT_LAYER, "circle-color", renk);
      }
      if (map.getLayer(HEAT_LAYER_CLOUD)) {
        map.setPaintProperty(HEAT_LAYER_CLOUD, "heatmap-weight", [
          "interpolate", ["linear"], ["get", "sayi"], 0, 0, maxSayi, 1,
        ]);
      }
    } else {
      map.addSource(HEAT_SRC, { type: "geojson", data });

      // Düşük zoom'da heatmap (bulut)
      map.addLayer({
        id: HEAT_LAYER_CLOUD,
        type: "heatmap",
        source: HEAT_SRC,
        maxzoom: 16,
        paint: {
          "heatmap-weight": [
            "interpolate", ["linear"], ["get", "sayi"], 0, 0, maxSayi, 1,
          ],
          "heatmap-intensity": [
            "interpolate", ["linear"], ["zoom"], 8, 1, 16, 3,
          ],
          "heatmap-color": [
            "interpolate", ["linear"], ["heatmap-density"],
            0, "rgba(255,254,179,0)",
            0.2, "rgba(255,254,179,0.6)",
            0.5, "rgba(253,174,97,0.8)",
            1, "rgba(215,25,28,0.9)",
          ],
          "heatmap-radius": [
            "interpolate", ["linear"], ["zoom"], 8, 8, 16, 30,
          ],
          "heatmap-opacity": [
            "interpolate", ["linear"], ["zoom"], 14, 0.8, 16, 0.3,
          ],
        },
      });

      // Yüksek zoom'da circle (parsel detayı)
      map.addLayer({
        id: HEAT_LAYER,
        type: "circle",
        source: HEAT_SRC,
        minzoom: 14,
        paint: {
          "circle-radius": [
            "interpolate", ["linear"], ["get", "sayi"],
            1, 4,
            10, 14,
          ],
          "circle-color": renk,
          "circle-opacity": 0.7,
          "circle-stroke-width": 1,
          "circle-stroke-color": "white",
        },
      });
    }

    if (options.fitBounds && noktalar.length > 0) {
      const lats = noktalar.map((n) => n.enlem);
      const lngs = noktalar.map((n) => n.boylam);
      const sw: [number, number] = [Math.min(...lngs), Math.min(...lats)];
      const ne: [number, number] = [Math.max(...lngs), Math.max(...lats)];
      try {
        map.fitBounds([sw, ne], { padding: 30, maxZoom: 15, duration: 500 });
      } catch {
        const lng0 = lngs[0]; const lat0 = lats[0];
        if (lng0 != null && lat0 != null) map.flyTo({ center: [lng0, lat0], zoom: 15 });
      }
    }
  };

  if (map.isStyleLoaded()) {
    setOrCreate();
  } else {
    map.once("load", setOrCreate);
  }
}

/** Heatmap layer ve source'u haritadan tamamen kaldır */
export function removeHeatmap(map: MapLibreMap | null): void {
  if (!map) return;
  for (const id of [HEAT_LAYER, HEAT_LAYER_CLOUD]) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource(HEAT_SRC)) map.removeSource(HEAT_SRC);
}
