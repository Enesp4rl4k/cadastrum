/**
 * bolge-map-layers.ts — BolgeView MapLibre katman yardımcıları
 *
 * BolgeView.tsx'den çıkarıldı (1266 → ~1100 satır hedefi).
 * Sorumluluk: MapLibre source/layer yönetimi — pure, React bağımlılığı yok.
 *
 * Export:
 *   drawBbox        — BBox dikdörtgen katmanı çiz / güncelle
 *   eraseBbox       — Bbox + parsel katmanlarını temizle
 *   drawParseller   — Parsel polygon katmanı çiz / güncelle (hover popup dahil)
 *   drawTkgmHeatmap — TKGM analiz ısı haritası katmanı
 */

import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import { nitelikRenkBul, type BBox } from "../../lib/bolge-profili";
import type { Parsel } from "../../types/tkgm";
import type { AnalizNoktasi } from "../../lib/tkgm-analiz";

// ── BBox dikdörtgen ────────────────────────────────────────────────────────

export function drawBbox(map: MapLibreMap, bbox: BBox): void {
  const SRC  = "bbox-src";
  const FILL = "bbox-fill";
  const LINE = "bbox-line";

  const data: GeoJSON.Feature = {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [bbox.batiLng,  bbox.guneyLat],
          [bbox.doguLng,  bbox.guneyLat],
          [bbox.doguLng,  bbox.kuzeyLat],
          [bbox.batiLng,  bbox.kuzeyLat],
          [bbox.batiLng,  bbox.guneyLat],
        ],
      ],
    },
  };

  const src = map.getSource(SRC) as maplibregl.GeoJSONSource | undefined;
  if (src) {
    src.setData(data);
  } else {
    map.addSource(SRC, { type: "geojson", data });
    map.addLayer({
      id: FILL,
      type: "fill",
      source: SRC,
      paint: { "fill-color": "#0d6efd", "fill-opacity": 0.1 },
    });
    map.addLayer({
      id: LINE,
      type: "line",
      source: SRC,
      paint: { "line-color": "#0d6efd", "line-width": 2, "line-dasharray": [3, 2] },
    });
  }
}

// ── Bbox + parsel katmanlarını temizle ─────────────────────────────────────

export function eraseBbox(map: MapLibreMap | null): void {
  if (!map) return;
  for (const id of ["bbox-fill", "bbox-line", "parseller-fill", "parseller-line"]) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  for (const id of ["bbox-src", "parseller-src"]) {
    if (map.getSource(id)) map.removeSource(id);
  }
}

// ── Parsel polygon katmanı ─────────────────────────────────────────────────

export function drawParseller(map: MapLibreMap | null, parseller: Parsel[]): void {
  if (!map) return;
  const SRC  = "parseller-src";
  const FILL = "parseller-fill";
  const LINE = "parseller-line";

  const features: GeoJSON.Feature[] = parseller.map((p) => {
    const { renk } = nitelikRenkBul(p.nitelik);
    return {
      type: "Feature",
      geometry: p.geometri as GeoJSON.Geometry,
      properties: {
        nitelik: p.nitelik,
        alan: p.alan,
        adaParsel: `${p.adaNo}/${p.parselNo}`,
        renk,
      },
    };
  });

  const data: GeoJSON.FeatureCollection = { type: "FeatureCollection", features };
  const src = map.getSource(SRC) as maplibregl.GeoJSONSource | undefined;

  if (src) {
    src.setData(data);
  } else {
    map.addSource(SRC, { type: "geojson", data });
    map.addLayer({
      id: FILL,
      type: "fill",
      source: SRC,
      paint: {
        "fill-color": ["coalesce", ["get", "renk"], "#10b981"],
        "fill-opacity": 0.45,
      },
    });
    map.addLayer({
      id: LINE,
      type: "line",
      source: SRC,
      paint: {
        "line-color": ["coalesce", ["get", "renk"], "#059669"],
        "line-width": 1.2,
      },
    });

    // Hover popup
    let popup: maplibregl.Popup | null = null;
    map.on("mousemove", FILL, (e) => {
      if (!e.features?.[0]) return;
      map.getCanvas().style.cursor = "pointer";
      const props = e.features[0].properties as {
        nitelik: string;
        alan: number;
        adaParsel: string;
      };
      const html = `<div style="font:11px system-ui;padding:2px 4px;line-height:1.4">
        <strong>${props.adaParsel}</strong><br/>
        ${props.nitelik || "—"} · ${props.alan.toLocaleString("tr-TR")} m²
      </div>`;
      if (popup) popup.remove();
      popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false })
        .setLngLat(e.lngLat)
        .setHTML(html)
        .addTo(map);
    });
    map.on("mouseleave", FILL, () => {
      map.getCanvas().style.cursor = "";
      if (popup) { popup.remove(); popup = null; }
    });
  }
}

// ── TKGM alım-satım ısı haritası ──────────────────────────────────────────

export function drawTkgmHeatmap(map: MapLibreMap, noktalar: AnalizNoktasi[]): void {
  const SRC   = "tkgm-heat-bolge-src";
  const LAYER = "tkgm-heat-bolge-layer";
  if (noktalar.length === 0) return;

  const maxSayi = Math.max(...noktalar.map((n) => n.sayi), 1);
  const features: GeoJSON.Feature[] = noktalar.map((n) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [n.boylam, n.enlem] },
    properties: { sayi: n.sayi, weight: n.sayi / maxSayi },
  }));
  const data: GeoJSON.FeatureCollection = { type: "FeatureCollection", features };

  const src = map.getSource(SRC) as maplibregl.GeoJSONSource | undefined;
  if (src) {
    src.setData(data);
  } else {
    map.addSource(SRC, { type: "geojson", data });
    map.addLayer({
      id: LAYER,
      type: "heatmap",
      source: SRC,
      paint: {
        "heatmap-weight":     ["get", "weight"],
        "heatmap-intensity":  0.9,
        "heatmap-radius":     18,
        "heatmap-color": [
          "interpolate", ["linear"], ["heatmap-density"],
          0,   "rgba(124, 58, 237, 0)",
          0.2, "rgba(124, 58, 237, 0.3)",
          0.5, "rgba(168, 85, 247, 0.55)",
          0.8, "rgba(220, 38, 38, 0.7)",
          1,   "rgba(127, 29, 29, 0.85)",
        ],
        "heatmap-opacity": 0.75,
      },
    });
  }
}
