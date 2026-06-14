import type maplibregl from "maplibre-gl";

export type BasemapId =
  | "osm"
  | "carto-light"
  | "carto-dark"
  | "esri-sat"
  | "opentopo";

export interface BasemapDef {
  id: BasemapId;
  ad: string;
  ikon: string;
  style: maplibregl.StyleSpecification;
}

const BASEMAPS: BasemapDef[] = [
  {
    id: "osm",
    ad: "Sokak (OSM)",
    ikon: "🗺",
    style: {
      version: 8,
      // MapLibre symbol layer'ları text-field için PBF glyph fontu ister.
      // Demotiles "Noto Sans Regular" sunar — symbol layer'larda text-font olarak bunu kullanıyoruz.
      glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
      sources: {
        osm: {
          type: "raster",
          tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
          tileSize: 256,
          attribution: "© OpenStreetMap",
        },
      },
      layers: [{ id: "osm", type: "raster", source: "osm" }],
    },
  },
  {
    id: "carto-light",
    ad: "Açık (Carto)",
    ikon: "☀",
    style: {
      version: 8,
      // MapLibre symbol layer'ları text-field için PBF glyph fontu ister.
      // Demotiles "Noto Sans Regular" sunar — symbol layer'larda text-font olarak bunu kullanıyoruz.
      glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
      sources: {
        carto: {
          type: "raster",
          tiles: [
            "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
            "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
            "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
          ],
          tileSize: 256,
          attribution: "© OpenStreetMap, © CARTO",
        },
      },
      layers: [{ id: "carto", type: "raster", source: "carto" }],
    },
  },
  {
    id: "carto-dark",
    ad: "Koyu (Carto)",
    ikon: "🌙",
    style: {
      version: 8,
      // MapLibre symbol layer'ları text-field için PBF glyph fontu ister.
      // Demotiles "Noto Sans Regular" sunar — symbol layer'larda text-font olarak bunu kullanıyoruz.
      glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
      sources: {
        carto: {
          type: "raster",
          tiles: [
            "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
            "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
            "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
          ],
          tileSize: 256,
          attribution: "© OpenStreetMap, © CARTO",
        },
      },
      layers: [{ id: "carto", type: "raster", source: "carto" }],
    },
  },
  {
    id: "esri-sat",
    ad: "Uydu (ESRI)",
    ikon: "🛰",
    style: {
      version: 8,
      // MapLibre symbol layer'ları text-field için PBF glyph fontu ister.
      // Demotiles "Noto Sans Regular" sunar — symbol layer'larda text-font olarak bunu kullanıyoruz.
      glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
      sources: {
        esri: {
          type: "raster",
          tiles: [
            "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          ],
          tileSize: 256,
          attribution:
            "Tiles © Esri — Source: Esri, Maxar, Earthstar, USDA, USGS, AeroGRID, IGN",
          maxzoom: 19,
        },
        labels: {
          type: "raster",
          tiles: [
            "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
          ],
          tileSize: 256,
          maxzoom: 19,
        },
      },
      layers: [
        { id: "esri", type: "raster", source: "esri" },
        { id: "labels", type: "raster", source: "labels" },
      ],
    },
  },
  {
    id: "opentopo",
    ad: "Topo (OTM)",
    ikon: "⛰",
    style: {
      version: 8,
      // MapLibre symbol layer'ları text-field için PBF glyph fontu ister.
      // Demotiles "Noto Sans Regular" sunar — symbol layer'larda text-font olarak bunu kullanıyoruz.
      glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
      sources: {
        otm: {
          type: "raster",
          tiles: [
            "https://a.tile.opentopomap.org/{z}/{x}/{y}.png",
            "https://b.tile.opentopomap.org/{z}/{x}/{y}.png",
            "https://c.tile.opentopomap.org/{z}/{x}/{y}.png",
          ],
          tileSize: 256,
          maxzoom: 17,
          attribution: "© OpenStreetMap, SRTM | © OpenTopoMap (CC-BY-SA)",
        },
      },
      layers: [{ id: "otm", type: "raster", source: "otm" }],
    },
  },
];

export function getBasemap(id: BasemapId): BasemapDef {
  return BASEMAPS.find((b) => b.id === id) ?? BASEMAPS[0]!;
}

export function listBasemaps(): BasemapDef[] {
  return BASEMAPS;
}

export const DEFAULT_BASEMAP: BasemapId = "esri-sat";

const STORAGE_KEY = "arsa-basemap";

export function loadSavedBasemap(): BasemapId {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && BASEMAPS.some((b) => b.id === v)) return v as BasemapId;
  } catch {}
  return DEFAULT_BASEMAP;
}

export function saveBasemap(id: BasemapId): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {}
}
