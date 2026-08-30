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
    ad: "Açık (Esri)",
    ikon: "☀",
    style: {
      version: 8,
      // MapLibre symbol layer'ları text-field için PBF glyph fontu ister.
      // Demotiles "Noto Sans Regular" sunar — symbol layer'larda text-font olarak bunu kullanıyoruz.
      glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
      // ALTLIK SAĞLAYICI NOTU (Ağustos 2026): burada eskiden CARTO
      // (basemaps.cartocdn.com) vardı. CARTO anahtarsız isteklere artık HTTP
      // 200 + ÜZERİNE "API KEY REQUIRED" filigranı basılmış döşeme dönüyor —
      // istek başarısız olmadığı için hiçbir hata yakalanmıyor, harita sessizce
      // filigranlı çiziliyordu. Esri'nin gri kanvas servisi anahtarsız ve
      // filigransız çalışıyor; uygulama zaten uydu katmanı için aynı servisi
      // kullanıyor.
      //
      // `carto-light` / `carto-dark` KİMLİKLERİ korunuyor: kullanıcının seçimi
      // localStorage'da bu anahtarla saklı, değiştirmek herkesin tercihini
      // sıfırlardı.
      //
      // DİKKAT: Esri döşeme yolu {z}/{y}/{x} sırasındadır — XYZ'nin
      // {z}/{x}/{y}'sinden FARKLI. Ters yazılırsa harita sessizce yanlış yeri
      // gösterir (hata vermez).
      sources: {
        carto: {
          type: "raster",
          tiles: [
            "https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
          ],
          tileSize: 256,
          // Gri kanvasta gerçek görüntü z16'ya kadar; üstünde Esri 200 ile BOŞ
          // döşeme dönüyor (yine "200 ama içerik yok"). maxzoom verilmezse
          // harita yakınlaşınca sessizce bomboş kalır — MapLibre bunun yerine
          // z16 döşemesini büyütsün.
          maxzoom: 16,
          attribution: "Esri, HERE, Garmin, © OpenStreetMap katkıcıları",
        },
      },
      layers: [{ id: "carto", type: "raster", source: "carto" }],
    },
  },
  {
    id: "carto-dark",
    ad: "Koyu (Esri)",
    ikon: "🌙",
    style: {
      version: 8,
      // MapLibre symbol layer'ları text-field için PBF glyph fontu ister.
      // Demotiles "Noto Sans Regular" sunar — symbol layer'larda text-font olarak bunu kullanıyoruz.
      glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
      sources: {
        carto: {
          type: "raster",
          // Bkz. yukarıdaki altlık sağlayıcı notu (CARTO → Esri, filigran).
          tiles: [
            "https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
          ],
          tileSize: 256,
          // Gri kanvasta gerçek görüntü z16'ya kadar; üstünde Esri 200 ile BOŞ
          // döşeme dönüyor (yine "200 ama içerik yok"). maxzoom verilmezse
          // harita yakınlaşınca sessizce bomboş kalır — MapLibre bunun yerine
          // z16 döşemesini büyütsün.
          maxzoom: 16,
          attribution: "Esri, HERE, Garmin, © OpenStreetMap katkıcıları",
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
