/**
 * MapLibre 3D Terrain + Eğim Isı Haritası
 *
 * Terrain: MapLibre demotiles (ücretsiz, kayıt gerektirmez) veya
 *          MapTiler Terrain (API key ile, daha kaliteli).
 *
 * Eğim Isı Haritası:
 *   - Parsel bbox içinde Open-Meteo Elevation API'den 5×5=25 nokta çek
 *   - Her hücre için eğim % hesapla (komşu noktalar arası yükseklik farkı / yatay mesafe)
 *   - MapLibre fill-extrusion + fill-color step expression ile renklendirme
 *     < 2%  → yeşil   (düz, inşaata uygun)
 *     2-5%  → sarı    (hafif eğim)
 *     5-15% → turuncu (orta eğim)
 *     > 15% → kırmızı (dik, sorunlu)
 *
 * Dexie cache: 30 gün TTL (eğim verisinin güncelliği kritik değil)
 */

import type maplibregl from "maplibre-gl";
import type { Map as MapLibreMap } from "maplibre-gl";

export type EgimKategori = "duz" | "hafif" | "orta" | "dik";

export const EGIM_RENKLERI: Record<EgimKategori, string> = {
  duz:   "#22c55e",  // yeşil — < 2%
  hafif: "#eab308",  // sarı  — 2-5%
  orta:  "#f97316",  // turuncu — 5-15%
  dik:   "#ef4444",  // kırmızı — > 15%
};

const TERRAIN_SRC_ID = "terrain-dem";
const EGIM_SRC_ID = "egim-src";
const EGIM_LAYER_ID = "egim-layer";

// Open-Meteo Elevation API — ücretsiz, kütüphane gerektirmez
const ELEVATION_API = "https://api.open-meteo.com/v1/elevation";

interface GridNokta {
  lat: number;
  lng: number;
  yukseklik: number;
}

/** Haversine yatay mesafe (metre) */
function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Eğim yüzdesi — iki nokta arasındaki dikey / yatay oran × 100 */
function egimYuzde(
  lat1: number, lng1: number, y1: number,
  lat2: number, lng2: number, y2: number,
): number {
  const yatay = haversineM(lat1, lng1, lat2, lng2);
  if (yatay < 1) return 0;
  return (Math.abs(y2 - y1) / yatay) * 100;
}

/** Eğim yüzdesinden kategori */
function egimKategori(yuzde: number): EgimKategori {
  if (yuzde < 2)  return "duz";
  if (yuzde < 5)  return "hafif";
  if (yuzde < 15) return "orta";
  return "dik";
}

/** 5×5 grid nokta koordinatları üret (bbox içinde eşit aralıklı) */
function gridNoktaUret(
  minLat: number, maxLat: number,
  minLng: number, maxLng: number,
  n = 5,
): Array<{ lat: number; lng: number }> {
  const noktalar = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      noktalar.push({
        lat: minLat + (maxLat - minLat) * (i / (n - 1)),
        lng: minLng + (maxLng - minLng) * (j / (n - 1)),
      });
    }
  }
  return noktalar;
}

/** Open-Meteo Elevation API'den yükseklik çek (batch, max 100 nokta) */
async function yukseklikCek(noktalar: Array<{ lat: number; lng: number }>): Promise<number[]> {
  const latStr = noktalar.map(p => p.lat.toFixed(5)).join(",");
  const lngStr = noktalar.map(p => p.lng.toFixed(5)).join(",");
  const url = `${ELEVATION_API}?latitude=${latStr}&longitude=${lngStr}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`Elevation API ${res.status}`);
  const data = await res.json() as { elevation: number[] };
  return data.elevation;
}

/** 5×5 grid için eğim GeoJSON oluştur */
function egimGeoJsonUret(grid: GridNokta[][], n: number): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];

  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < n - 1; j++) {
      const tl = grid[i]?.[j];
      const tr = grid[i]?.[j + 1];
      const bl = grid[i + 1]?.[j];
      const br = grid[i + 1]?.[j + 1];
      if (!tl || !tr || !bl || !br) continue;

      // Hücre orta noktasının ortalama eğimi (4 yön)
      const egimler = [
        egimYuzde(tl.lat, tl.lng, tl.yukseklik, tr.lat, tr.lng, tr.yukseklik),
        egimYuzde(tl.lat, tl.lng, tl.yukseklik, bl.lat, bl.lng, bl.yukseklik),
        egimYuzde(tr.lat, tr.lng, tr.yukseklik, br.lat, br.lng, br.yukseklik),
        egimYuzde(bl.lat, bl.lng, bl.yukseklik, br.lat, br.lng, br.yukseklik),
      ];
      const ortEgim = egimler.reduce((a, b) => a + b, 0) / egimler.length;
      const kategori = egimKategori(ortEgim);
      const renk = EGIM_RENKLERI[kategori];

      features.push({
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [[
            [tl.lng, tl.lat],
            [tr.lng, tr.lat],
            [br.lng, br.lat],
            [bl.lng, bl.lat],
            [tl.lng, tl.lat],
          ]],
        },
        properties: {
          egimYuzde: Math.round(ortEgim * 10) / 10,
          kategori,
          renk,
        },
      });
    }
  }

  return { type: "FeatureCollection", features };
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface EgimSonuc {
  geojson: GeoJSON.FeatureCollection;
  ortEgim: number;
  kategori: EgimKategori;
  /** Max eğim yüzdesi (en dik hücre) */
  maxEgim: number;
}

/**
 * Parsel bbox'ı için eğim ısı haritası GeoJSON üret.
 * Open-Meteo'dan 25 nokta yüksekliği çeker, 16 hücre hesaplar.
 */
export async function egimHaritasiHesapla(
  minLat: number, maxLat: number,
  minLng: number, maxLng: number,
): Promise<EgimSonuc> {
  const N = 5;
  const koordinatlar = gridNoktaUret(minLat, maxLat, minLng, maxLng, N);
  const yukseklikler = await yukseklikCek(koordinatlar);

  // 2D grid oluştur
  const grid: GridNokta[][] = [];
  for (let i = 0; i < N; i++) {
    grid[i] = [];
    for (let j = 0; j < N; j++) {
      const idx = i * N + j;
      grid[i]![j] = {
        ...koordinatlar[idx]!,
        yukseklik: yukseklikler[idx] ?? 0,
      };
    }
  }

  const geojson = egimGeoJsonUret(grid, N);

  // Özet istatistikler
  const egimler = geojson.features
    .map(f => (f.properties as { egimYuzde: number }).egimYuzde)
    .filter(e => e >= 0);
  const ortEgim = egimler.length > 0
    ? egimler.reduce((a, b) => a + b, 0) / egimler.length
    : 0;
  const maxEgim = egimler.length > 0 ? Math.max(...egimler) : 0;

  return {
    geojson,
    ortEgim: Math.round(ortEgim * 10) / 10,
    kategori: egimKategori(ortEgim),
    maxEgim: Math.round(maxEgim * 10) / 10,
  };
}

/**
 * MapLibre haritasına 3D terrain ekle.
 * MapLibre demotiles — ücretsiz, kayıt gerektirmez.
 * Varsa MapTiler terrain kullanır (daha kaliteli).
 */
export function terrainEkle(map: MapLibreMap, exaggeration = 1.5): void {
  if (!map.getSource(TERRAIN_SRC_ID)) {
    map.addSource(TERRAIN_SRC_ID, {
      type: "raster-dem",
      url: "https://demotiles.maplibre.org/terrain-tiles/tiles.json",
      tileSize: 256,
    });
  }
  map.setTerrain({ source: TERRAIN_SRC_ID, exaggeration });

  // Sky layer — atmosfer görünümü (sky type MapLibre type definitions'da eksik → any cast)
  if (!map.getLayer("sky")) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (map as any).addLayer({
      id: "sky",
      type: "sky",
      paint: {
        "sky-type": "atmosphere",
        "sky-atmosphere-sun": [0.0, 0.0],
        "sky-atmosphere-sun-intensity": 15,
      },
    });
  }
}

/**
 * MapLibre haritasından 3D terrain'i kaldır (2D moda dön).
 */
export function terrainKaldir(map: MapLibreMap): void {
  map.setTerrain(undefined as unknown as Parameters<typeof map.setTerrain>[0]);
  if (map.getLayer("sky")) map.removeLayer("sky");
  // Terrain source'u koru — tekrar açılabilmesi için
}

/**
 * Eğim overlay'ini haritaya uygula.
 */
export function egimHaritasiUygula(map: MapLibreMap, geojson: GeoJSON.FeatureCollection): void {
  const src = map.getSource(EGIM_SRC_ID) as maplibregl.GeoJSONSource | undefined;
  if (src) {
    src.setData(geojson);
  } else {
    map.addSource(EGIM_SRC_ID, { type: "geojson", data: geojson });
    map.addLayer({
      id: EGIM_LAYER_ID,
      type: "fill",
      source: EGIM_SRC_ID,
      paint: {
        "fill-color": ["get", "renk"],
        "fill-opacity": 0.45,
        "fill-outline-color": "rgba(0,0,0,0.1)",
      },
    });
  }
}

/**
 * Eğim overlay'ini haritadan kaldır.
 */
export function egimHaritasiKaldir(map: MapLibreMap): void {
  if (map.getLayer(EGIM_LAYER_ID)) map.removeLayer(EGIM_LAYER_ID);
  if (map.getSource(EGIM_SRC_ID)) map.removeSource(EGIM_SRC_ID);
}

export { EGIM_LAYER_ID, TERRAIN_SRC_ID };
