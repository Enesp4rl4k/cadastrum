/**
 * Overpass, haversine ve spatial grid yardımcıları — dataset üretim script'leri için.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const OVERPASS_HOSTS = [
  "https://overpass-api.de/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const R = 6371;
const toRad = (d) => (d * Math.PI) / 180;

export function haversineKm(la1, lo1, la2, lo2) {
  const dLat = toRad(la2 - la1);
  const dLng = toRad(lo2 - lo1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(la1)) * Math.cos(toRad(la2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export async function overpassFetch(query, label) {
  for (const host of OVERPASS_HOSTS) {
    process.stderr.write(`[${label}] ${new URL(host).host}...\n`);
    try {
      const res = await fetch(host, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "cadastrum-dataset/1.0 (arsa-tkgm-extension)",
          Accept: "application/json",
        },
        body: new URLSearchParams({ data: query }).toString(),
        signal: AbortSignal.timeout(620_000),
      });
      if (!res.ok) {
        process.stderr.write(`  → HTTP ${res.status}\n`);
        continue;
      }
      const data = await res.json();
      process.stderr.write(`  → ${data.elements?.length ?? 0} element\n`);
      if ((data.elements?.length ?? 0) > 0) return data;
    } catch (e) {
      process.stderr.write(`  → ${e.message}\n`);
    }
  }
  throw new Error(`${label}: tüm mirror başarısız`);
}

export async function getOrFetch(cacheFile, query, label) {
  if (existsSync(cacheFile)) {
    process.stderr.write(`[${label}] cache: ${cacheFile}\n`);
    return JSON.parse(readFileSync(cacheFile, "utf8"));
  }
  const data = await overpassFetch(query, label);
  const dir = dirname(cacheFile);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(cacheFile, JSON.stringify(data), "utf8");
  return data;
}

export function buildGrid(items, getLat, getLng, hucreBoy = 0.1) {
  const grid = new Map();
  items.forEach((item, i) => {
    const lat = getLat(item);
    const lng = getLng(item);
    if (!isFinite(lat) || !isFinite(lng)) return;
    const key = `${Math.floor(lat / hucreBoy)}_${Math.floor(lng / hucreBoy)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(i);
  });
  return { grid, hucreBoy };
}

function gridKomsular(grid, lat, lng, mesafeKm) {
  const dehucre = Math.ceil(mesafeKm / 8 / grid.hucreBoy);
  const cellLat = Math.floor(lat / grid.hucreBoy);
  const cellLng = Math.floor(lng / grid.hucreBoy);
  const idxler = [];
  for (let dy = -dehucre; dy <= dehucre; dy++) {
    for (let dx = -dehucre; dx <= dehucre; dx++) {
      const arr = grid.grid.get(`${cellLat + dy}_${cellLng + dx}`);
      if (arr) idxler.push(...arr);
    }
  }
  return idxler;
}

export function enYakinKm(noktaList, grid, lat, lng, maxKm) {
  const idxler = gridKomsular(grid, lat, lng, maxKm);
  let minD = Infinity;
  for (const i of idxler) {
    const n = noktaList[i];
    if (!n) continue;
    const d = haversineKm(lat, lng, n.lat, n.lng);
    if (d < minD) minD = d;
  }
  return minD < Infinity ? minD : null;
}

/** Way geometrisinden örnekleme noktaları (her step. nokta). */
export function wayNoktalari(elements, step = 4) {
  const noktalar = [];
  for (const el of elements ?? []) {
    if (el.type !== "way" || !el.geometry) continue;
    for (let i = 0; i < el.geometry.length; i += step) {
      noktalar.push({ lat: el.geometry[i].lat, lng: el.geometry[i].lon });
    }
  }
  return noktalar;
}

/** Element merkez koordinatı. */
export function elementMerkez(el) {
  if (el.type === "node") return { lat: el.lat, lng: el.lon };
  if (el.center) return { lat: el.center.lat, lng: el.center.lon };
  if (el.lat != null && el.lon != null) return { lat: el.lat, lng: el.lon };
  if (el.geometry?.length) {
    const g = el.geometry[Math.floor(el.geometry.length / 2)];
    return { lat: g.lat, lng: g.lon };
  }
  return null;
}

/** TS dataset dosyası üret. */
export function tsDatasetYaz(dosya, baslik, typeExport, constAd, veri, ekstra = "") {
  const ts = `/**
${baslik.split("\n").map((l) => ` * ${l}`).join("\n")}
 *
 * Üreten: scripts (Faz A veri pipeline)
 * Üretim: ${new Date().toISOString().slice(0, 10)}
 */
${typeExport}

export const ${constAd}: Readonly<Record<string, ${constAd.includes("Tuple") ? constAd.replace("export type ", "").replace(" =", "") : "unknown"}>> = ${JSON.stringify(veri)};
${ekstra}
`;
  writeFileSync(dosya, ts, "utf8");
  process.stderr.write(`✓ ${dosya} (${(ts.length / 1024).toFixed(0)} KB, ${Object.keys(veri).length} kayıt)\n`);
}
