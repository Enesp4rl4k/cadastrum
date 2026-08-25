/**
 * map-poi-layer — MapLibre GL yakın POI katman yönetimi
 *
 * Parsel merkezinden seçilen POI'lere çizgi + daire + etiket çizer.
 * `poiler === null` geçilirse tüm kaynak ve katmanlar temizlenir.
 *
 * Bağımlılık: maplibre-gl (peer), sadece MapLibreMap instance'ı alır.
 * React bağımlılığı yoktur — saf MapLibre utility.
 */
import type maplibregl from "maplibre-gl";
import type { Map as MapLibreMap, GeoJSONSource } from "maplibre-gl";

export interface PoiNokta {
  tip: string;
  ad: string;
  lat: number;
  lng: number;
  mesafeM: number;
  ikon?: string;
}

const LINE_SRC        = "yakin-line-src";
const POINT_SRC       = "yakin-point-src";
const LINE_LABEL_SRC  = "yakin-line-label-src";
const LINE_LAYER      = "yakin-line-layer";
const POINT_LAYER     = "yakin-point-layer";
const LABEL_LAYER     = "yakin-label-layer";
const LINE_LABEL_LAYER = "yakin-line-label-layer";

/** POI tipine göre renk paleti — MapLibre expression */
const renkMap: any = [
  "match", ["get", "tip"],
  "okul",      "#3B82F6",   // mavi (eğitim)
  "saglik",    "#DC2626",   // kırmızı (sağlık)
  "durak",     "#10B981",   // yeşil (toplu taşıma)
  "motorway",  "#F59E0B",   // turuncu (otoyol)
  "trunk",     "#F59E0B",
  "primary",   "#FBBF24",   // sarı-turuncu
  "secondary", "#FBBF24",
  "havalimani","#8B5CF6",   // mor (havalimanı)
  "airport",   "#8B5CF6",
  "tren",      "#6366F1",   // indigo (raylı sistem)
  "railway",   "#6366F1",
  "liman",     "#0EA5E9",   // gök mavi (deniz)
  "port",      "#0EA5E9",
  "ferry",     "#0EA5E9",
  "endustri",  "#71717A",   // gri (sanayi)
  "osb",       "#71717A",
  "su_yolu",   "#06B6D4",   // cyan (su)
  "river",     "#06B6D4",
  "koy",       "#A78BFA",   // lavanta (köy/yerleşim)
  /* default */ "#F59E0B",
];

const TIP_ADLARI: Record<string, string> = {
  okul:       "Eğitim",
  saglik:     "Sağlık",
  durak:      "Toplu taşıma",
  motorway:   "Otoyol",
  trunk:      "Devlet yolu",
  primary:    "Anayol",
  secondary:  "İkincil yol",
  havalimani: "Havalimanı",
  airport:    "Havalimanı",
  tren:       "Tren / metro",
  railway:    "Demiryolu",
  liman:      "Liman",
  port:       "Liman",
  ferry:      "Feribot",
  endustri:   "Sanayi",
  osb:        "OSB",
  su_yolu:    "Su yolu",
  river:      "Nehir",
  koy:        "Yerleşim",
};

/** Tüm yakin-poi katman ve kaynaklarını haritadan temizle */
function temizle(map: MapLibreMap): void {
  for (const id of [
    "yakin-line-label-layer",
    LABEL_LAYER,
    POINT_LAYER + "-ikon",
    POINT_LAYER,
    POINT_LAYER + "-halo",
    LINE_LAYER,
  ]) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  for (const id of [LINE_LABEL_SRC, POINT_SRC, LINE_SRC]) {
    if (map.getSource(id)) map.removeSource(id);
  }
}

/**
 * Yakın POI'leri haritada çizgiyle göster.
 * `poiler === null` geçilirse temizler.
 */
export function drawYakinPoiler(
  map: MapLibreMap,
  merkez: { lat: number; lng: number },
  poiler: PoiNokta[] | null,
): void {
  if (poiler === null || poiler.length === 0) {
    temizle(map);
    return;
  }

  // Her POI için parselden POI'ye LineString
  const lineFeatures: GeoJSON.Feature[] = poiler.map((p) => ({
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: [[merkez.lng, merkez.lat], [p.lng, p.lat]],
    },
    properties: { tip: p.tip, ad: p.ad, mesafeM: p.mesafeM },
  }));

  const pointFeatures: GeoJSON.Feature[] = poiler.map((p) => {
    const km = p.mesafeM >= 1000 ? `${(p.mesafeM / 1000).toFixed(1)}km` : `${p.mesafeM}m`;
    return {
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      properties: {
        tip:     p.tip,
        ad:      p.ad,
        mesafeM: p.mesafeM,
        ikon:    p.ikon ?? "📍",
        etiket:  `${p.ikon ?? "📍"} ${p.ad}\n${km}`,
      },
    };
  });

  // Mesafe etiketleri için çizginin orta noktası
  const labelFeatures: GeoJSON.Feature[] = poiler.map((p) => {
    const km = p.mesafeM >= 1000 ? `${(p.mesafeM / 1000).toFixed(1)}km` : `${p.mesafeM}m`;
    return {
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [(merkez.lng + p.lng) / 2, (merkez.lat + p.lat) / 2],
      },
      properties: { mesafe: km, tip: p.tip },
    };
  });

  const lineData:  GeoJSON.FeatureCollection = { type: "FeatureCollection", features: lineFeatures };
  const pointData: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: pointFeatures };
  const labelData: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: labelFeatures };

  // Çizgi kaynağı
  const lineSrc = map.getSource(LINE_SRC) as GeoJSONSource | undefined;
  if (lineSrc) {
    lineSrc.setData(lineData);
  } else {
    map.addSource(LINE_SRC, { type: "geojson", data: lineData });
    map.addLayer({
      id: LINE_LAYER,
      type: "line",
      source: LINE_SRC,
      paint: {
        "line-color": renkMap as any,
        "line-width": 1.5,
        "line-dasharray": [2, 2],
        "line-opacity": 0.65,
      },
    });
  }

  // Nokta kaynağı
  const pointSrc = map.getSource(POINT_SRC) as GeoJSONSource | undefined;
  if (pointSrc) {
    pointSrc.setData(pointData);
  } else {
    map.addSource(POINT_SRC, { type: "geojson", data: pointData });

    // Halo (dış halka)
    map.addLayer({
      id: POINT_LAYER + "-halo",
      type: "circle",
      source: POINT_SRC,
      paint: {
        "circle-radius": 12,
        "circle-color": renkMap as any,
        "circle-opacity": 0.18,
      },
    });

    // Asıl daire
    map.addLayer({
      id: POINT_LAYER,
      type: "circle",
      source: POINT_SRC,
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 5, 14, 7, 18, 10],
        "circle-color": renkMap as any,
        "circle-stroke-color": "#fff",
        "circle-stroke-width": 2,
      },
    });

    // İkon (emoji)
    map.addLayer({
      id: POINT_LAYER + "-ikon",
      type: "symbol",
      source: POINT_SRC,
      layout: {
        "text-field": ["get", "ikon"],
        "text-font": ["Noto Sans Regular"],
        "text-size": 11,
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
    });

    // İsim + mesafe etiketi
    map.addLayer({
      id: LABEL_LAYER,
      type: "symbol",
      source: POINT_SRC,
      layout: {
        "text-field": ["get", "etiket"],
        "text-font": ["Noto Sans Regular"],
        "text-size": 10,
        "text-offset": [0, 1.4],
        "text-anchor": "top",
        "text-allow-overlap": false,
        "text-optional": true,
        "text-max-width": 8,
      },
      paint: {
        "text-color": "#1B2A4A",
        "text-halo-color": "#fff",
        "text-halo-width": 2,
      },
    });

    // Tıklama popup
    map.on("click", POINT_LAYER, (e) => {
      const f = e.features?.[0];
      if (!f || f.geometry.type !== "Point") return;
      const props = f.properties as { ad: string; tip: string; mesafeM: number; ikon: string };
      const km =
        props.mesafeM >= 1000
          ? `${(props.mesafeM / 1000).toFixed(2)} km`
          : `${props.mesafeM} m`;
      const popup = new (window as any).maplibregl.Popup({ offset: 16, closeButton: true })
        .setLngLat((f.geometry as any).coordinates)
        .setHTML(`
          <div style="font-family:Inter,sans-serif;min-width:160px">
            <div style="font-size:9pt;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px">
              ${TIP_ADLARI[props.tip] ?? props.tip}
            </div>
            <div style="font-size:12pt;font-weight:600;color:#1B2A4A;margin-bottom:4px">
              ${props.ikon} ${props.ad}
            </div>
            <div style="font-size:10pt;color:#475569;display:flex;align-items:center;gap:6px">
              <span>📏</span>
              <span>${km}</span>
            </div>
          </div>
        `)
        .addTo(map as any);
      void popup;
    });

    map.on("mouseenter", POINT_LAYER, () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", POINT_LAYER, () => { map.getCanvas().style.cursor = ""; });
  }

  // Çizgi üzerinde mesafe etiketi
  const lineLabelSrc = map.getSource(LINE_LABEL_SRC) as GeoJSONSource | undefined;
  if (lineLabelSrc) {
    lineLabelSrc.setData(labelData);
  } else {
    map.addSource(LINE_LABEL_SRC, { type: "geojson", data: labelData });
    map.addLayer({
      id: LINE_LABEL_LAYER,
      type: "symbol",
      source: LINE_LABEL_SRC,
      layout: {
        "text-field": ["get", "mesafe"],
        "text-font": ["Noto Sans Regular"],
        "text-size": 9,
        "text-allow-overlap": false,
        "text-optional": true,
      },
      paint: {
        "text-color": "#475569",
        "text-halo-color": "#fff",
        "text-halo-width": 2,
      },
    });
  }
}
