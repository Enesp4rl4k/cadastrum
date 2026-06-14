#!/usr/bin/env node
/**
 * Türkiye'deki tüm mahalleleri/yerleşim yerlerini OSM'den çek.
 *
 * 3 adımlı:
 *   1. place=* node'larını çek (~70k yerleşim, 28sn)
 *   2. İl + ilçe polygonlarını çek (admin_level=4 ve 6, ~30sn)
 *   3. osmtogeojson + @turf ile point-in-polygon match
 *
 * Çıktı: data/mahalleler.json — { il, ilce, mahalle, tip, lat, lng, mahalleNorm, ... }[]
 *
 * Cache: data/.cache-*.json (Overpass yanıtlarını sakla, tekrar yapmasın)
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import osmtogeojson from "osmtogeojson";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ÇIKTI = `${__dirname}/../data/mahalleler.json`;
const NODE_CACHE = `${__dirname}/../data/.cache-mahalle-nodes.json`;
const POLYGON_CACHE = `${__dirname}/../data/.cache-il-ilce-polygons.json`;

const OVERPASS_HOSTS = [
  "https://overpass-api.de/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const NODE_QUERY = `
[out:json][timeout:300];
area["ISO3166-1"="TR"][admin_level=2]->.tr;
(
  node["place"~"^(neighbourhood|suburb|quarter|village|hamlet)$"](area.tr);
);
out;
`.trim();

// İl (admin_level=4) ve ilçe (admin_level=6) polygonları, geometry'leriyle
const POLYGON_QUERY = `
[out:json][timeout:600];
area["ISO3166-1"="TR"][admin_level=2]->.tr;
(
  rel["boundary"="administrative"]["admin_level"="4"](area.tr);
  rel["boundary"="administrative"]["admin_level"="6"](area.tr);
);
out body;
>;
out skel qt;
`.trim();

async function overpassFetch(query, label) {
  for (const host of OVERPASS_HOSTS) {
    process.stderr.write(`[${label}] ${new URL(host).host} deneniyor...\n`);
    try {
      const params = new URLSearchParams({ data: query });
      const start = Date.now();
      const res = await fetch(host, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "arsa-tkgm-extension/1.0 (cadastre analysis tool)",
          "Accept": "application/json",
        },
        body: params.toString(),
        signal: AbortSignal.timeout(620_000),
      });
      const sure = ((Date.now() - start) / 1000).toFixed(1);
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        process.stderr.write(`  → HTTP ${res.status} (${sure}s): ${txt.slice(0, 200)}\n`);
        continue;
      }
      const data = await res.json();
      const count = data.elements?.length ?? 0;
      process.stderr.write(`  → ${count} element alındı (${sure}s)\n`);
      if (count === 0) continue;
      return data;
    } catch (e) {
      process.stderr.write(`  → ${e.message}\n`);
    }
  }
  throw new Error(`${label}: Tüm Overpass mirror'ları başarısız.`);
}

// Extension'daki normalizeYerAdi() ile birebir aynı çıktı (lookup uyumlu).
// src/lib/tkgm-api.ts'deki normalizeYerAdi: tr-latin + mahalle suffix temizle + boşluk normalize.
function normalize(s) {
  return s
    .trim()
    .toLocaleLowerCase("tr")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/\b(mahallesi|mahalle|koyu|koy|beldesi|belde|mah|mh)\b/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function getOrFetch(cacheFile, query, label) {
  if (existsSync(cacheFile)) {
    process.stderr.write(`[${label}] Cache'den okunuyor: ${cacheFile}\n`);
    return JSON.parse(readFileSync(cacheFile, "utf8"));
  }
  const data = await overpassFetch(query, label);
  if (!existsSync(dirname(cacheFile))) {
    mkdirSync(dirname(cacheFile), { recursive: true });
  }
  writeFileSync(cacheFile, JSON.stringify(data), "utf8");
  return data;
}

/** Polygon bbox hesapla (GeoJSON Polygon/MultiPolygon coordinates'tan). */
function bboxOfPolygon(geom) {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  const polygons = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  for (const poly of polygons) {
    for (const ring of poly) {
      for (const [lng, lat] of ring) {
        if (lng < minLng) minLng = lng;
        if (lat < minLat) minLat = lat;
        if (lng > maxLng) maxLng = lng;
        if (lat > maxLat) maxLat = lat;
      }
    }
  }
  return [minLng, minLat, maxLng, maxLat];
}

async function main() {
  // 1. Yerleşim node'larını çek
  const nodeData = await getOrFetch(NODE_CACHE, NODE_QUERY, "node-cek");
  const nodes = (nodeData.elements ?? []).filter(el => el.type === "node" && el.tags?.name);
  process.stderr.write(`[ana] ${nodes.length} adlandırılmış yerleşim\n`);

  // 2. İl + ilçe polygonlarını çek
  const polyData = await getOrFetch(POLYGON_CACHE, POLYGON_QUERY, "polygon-cek");
  process.stderr.write(`[ana] osmtogeojson ile parse ediliyor...\n`);
  const geojson = osmtogeojson(polyData);
  process.stderr.write(`[ana] ${geojson.features.length} GeoJSON feature\n`);

  // İl ve ilçe polygonlarını ayır
  const ilFeatures = [];
  const ilceFeatures = [];
  for (const f of geojson.features) {
    if (f.geometry?.type !== "Polygon" && f.geometry?.type !== "MultiPolygon") continue;
    const adminLevel = f.properties?.admin_level || f.properties?.tags?.admin_level;
    const ad = f.properties?.name || f.properties?.tags?.name;
    if (!ad) continue;
    const item = { ad, geom: f.geometry, bbox: bboxOfPolygon(f.geometry) };
    if (adminLevel === "4") ilFeatures.push(item);
    else if (adminLevel === "6") ilceFeatures.push(item);
  }
  process.stderr.write(`[ana] ${ilFeatures.length} il polygon, ${ilceFeatures.length} ilçe polygon\n`);

  function pointInBbox(lng, lat, bbox) {
    return lng >= bbox[0] && lng <= bbox[2] && lat >= bbox[1] && lat <= bbox[3];
  }

  // 3. Her node için il+ilçe match
  const mahalleler = [];
  let eslesmeyen = 0, ilSiz = 0;
  let i = 0;
  for (const node of nodes) {
    i++;
    if (i % 5000 === 0) {
      process.stderr.write(`[ana] ${i}/${nodes.length} (eşleşen: ${mahalleler.length})...\n`);
    }
    const ad = node.tags.name;
    const tip = node.tags.place;
    const lat = node.lat;
    const lng = node.lon;
    const point = { type: "Point", coordinates: [lng, lat] };

    // İlçe match
    let ilceMatch = null;
    for (const f of ilceFeatures) {
      if (!pointInBbox(lng, lat, f.bbox)) continue;
      if (booleanPointInPolygon(point, { type: "Feature", geometry: f.geom, properties: {} })) {
        ilceMatch = f;
        break;
      }
    }

    // İl match
    let ilMatch = null;
    for (const f of ilFeatures) {
      if (!pointInBbox(lng, lat, f.bbox)) continue;
      if (booleanPointInPolygon(point, { type: "Feature", geometry: f.geom, properties: {} })) {
        ilMatch = f;
        break;
      }
    }

    if (!ilceMatch) {
      eslesmeyen++;
      continue;
    }
    if (!ilMatch) ilSiz++;

    const adTemiz = ad.replace(/\s*Mahallesi\s*$/i, "").replace(/\s*Köyü\s*$/i, "").trim();

    mahalleler.push({
      osmId: node.id,
      ad: adTemiz,
      adTam: ad,
      tip,
      il: ilMatch?.ad ?? null,
      ilce: ilceMatch.ad,
      lat: +lat.toFixed(6),
      lng: +lng.toFixed(6),
      ilNorm: ilMatch?.ad ? normalize(ilMatch.ad) : null,
      ilceNorm: normalize(ilceMatch.ad),
      mahalleNorm: normalize(adTemiz),
    });
  }

  process.stderr.write(`[ana] Eşleşen: ${mahalleler.length}, eşleşmeyen: ${eslesmeyen}, il'siz: ${ilSiz}\n`);

  const tipSayim = {};
  for (const m of mahalleler) tipSayim[m.tip] = (tipSayim[m.tip] ?? 0) + 1;
  process.stderr.write(`[ana] Tip dağılımı: ${JSON.stringify(tipSayim)}\n`);

  // En çok mahallesi olan top 5 il
  const ilSayim = {};
  for (const m of mahalleler) {
    if (m.il) ilSayim[m.il] = (ilSayim[m.il] ?? 0) + 1;
  }
  const topIller = Object.entries(ilSayim).sort((a, b) => b[1] - a[1]).slice(0, 5);
  process.stderr.write(`[ana] Top 5 il: ${topIller.map(([k, v]) => `${k}:${v}`).join(", ")}\n`);

  if (!existsSync(dirname(ÇIKTI))) {
    mkdirSync(dirname(ÇIKTI), { recursive: true });
  }
  writeFileSync(ÇIKTI, JSON.stringify(mahalleler, null, 2), "utf8");
  process.stderr.write(`[ana] ✓ ${ÇIKTI} (${(JSON.stringify(mahalleler).length / 1024 / 1024).toFixed(2)} MB)\n`);
}

main().catch((e) => {
  process.stderr.write(`HATA: ${e.message}\n${e.stack}\n`);
  process.exit(1);
});
