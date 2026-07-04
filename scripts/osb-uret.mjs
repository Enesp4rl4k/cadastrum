#!/usr/bin/env node
/**
 * OSB koordinat dataset'i — Overpass (OSM industrial) + mevcut osblar.ts birleşimi.
 *
 * Kullanım: node scripts/osb-uret.mjs
 * Çıktı: src/lib/data/osblar.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { elementMerkez, getOrFetch, haversineKm } from "./lib/geo-utils.mjs";
import { normalizeTr } from "./lib/normalize-tr.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CACHE = join(ROOT, "data/.cache-osb-overpass.json");
const OUT = join(ROOT, "src/lib/data/osblar.ts");
const MEVCUT = join(ROOT, "src/lib/data/osblar.ts");

const QUERY = `
[out:json][timeout:300];
(
  nwr["landuse"="industrial"](35.8,25.7,42.1,44.8);
  nwr["industrial"="yes"](35.8,25.7,42.1,44.8);
  nwr["name"~"Organize Sanayi|OSB|osb",i](35.8,25.7,42.1,44.8);
);
out center tags;
`.trim();

function mevcutOku() {
  const src = readFileSync(MEVCUT, "utf8");
  const m = src.match(/export const OSBLAR[^=]*=\s*(\[[\s\S]*?\]);/);
  if (!m) return [];
  return JSON.parse(m[1].replace(/(\w+):/g, '"$1":').replace(/'/g, '"')
    .replace(/,\s*]/g, "]")
    .replace(/(\{[^{}]*\})/g, (block) =>
      block.replace(/(\w+):/g, '"$1":').replace(/'/g, '"'),
    ));
}

function mevcutParseGuvenli() {
  try {
    const src = readFileSync(MEVCUT, "utf8");
    const items = [];
    const re = /\{\s*ad:\s*"([^"]+)"\s*,\s*il:\s*"([^"]+)"\s*,\s*lat:\s*([\d.]+)\s*,\s*lng:\s*([\d.]+)\s*\}/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      items.push({ ad: m[1], il: m[2], lat: parseFloat(m[3]), lng: parseFloat(m[4]) });
    }
    return items;
  } catch {
    return [];
  }
}

function ilTahmin(tags, lat, lng) {
  if (tags["addr:city"]) return tags["addr:city"];
  if (tags["is_in:city"]) return tags["is_in:city"];
  const name = tags.name ?? tags["name:tr"] ?? "OSB";
  return name;
}

function birlestir(liste) {
  const sonuc = [];
  for (const n of liste) {
    if (!isFinite(n.lat) || !isFinite(n.lng)) continue;
    const yakin = sonuc.find((x) => haversineKm(x.lat, x.lng, n.lat, n.lng) < 2.5);
    if (yakin) {
      if ((n.ad?.length ?? 0) > (yakin.ad?.length ?? 0)) yakin.ad = n.ad;
      continue;
    }
    sonuc.push({ ...n });
  }
  return sonuc.sort((a, b) => a.il.localeCompare(b.il, "tr") || a.ad.localeCompare(b.ad, "tr"));
}

async function main() {
  const mevcut = mevcutParseGuvenli();
  process.stderr.write(`[osb] Mevcut: ${mevcut.length} nokta\n`);

  const data = await getOrFetch(CACHE, QUERY, "osb");
  const overpass = [];
  for (const el of data.elements ?? []) {
    const tags = el.tags ?? {};
    const merkez = elementMerkez(el);
    if (!merkez) continue;
    const ad = (tags.name ?? tags["name:tr"] ?? "Organize Sanayi Bölgesi").trim();
    const adNorm = normalizeTr(ad);
    if (!adNorm.includes("osb") && !adNorm.includes("organize sanayi") && tags.landuse !== "industrial" && tags.industrial !== "yes") {
      continue;
    }
    overpass.push({
      ad: ad.slice(0, 80),
      il: ilTahmin(tags, merkez.lat, merkez.lng),
      lat: +merkez.lat.toFixed(4),
      lng: +merkez.lng.toFixed(4),
    });
  }
  process.stderr.write(`[osb] Overpass: ${overpass.length} ham nokta\n`);

  const birlesik = birlestir([...mevcut, ...overpass]);
  process.stderr.write(`[osb] Birleşik (dedupe): ${birlesik.length} nokta\n`);

  const satirlar = birlesik.map(
    (o) => `  { ad: ${JSON.stringify(o.ad)}, il: ${JSON.stringify(o.il)}, lat: ${o.lat}, lng: ${o.lng} },`,
  );
  const ts = `/** Türkiye OSB koordinatları — statik dataset.
 *  Kaynak: OSM Overpass (landuse=industrial, OSB adı) + mevcut OSBÜK listesi.
 *  Hassasiyet: ±1–3 km. Üreten: scripts/osb-uret.mjs
 *  Son güncelleme: ${new Date().toISOString().slice(0, 10)} */
export const OSBLAR: ReadonlyArray<{
  ad: string;
  il: string;
  lat: number;
  lng: number;
}> = [
${satirlar.join("\n")}
];
`;
  writeFileSync(OUT, ts, "utf8");
  process.stderr.write(`[osb] ✓ ${OUT}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
