#!/usr/bin/env node
/**
 * data/mahalleler.json → src/lib/data/mahalle-merkezleri.ts
 *
 * Faz 2 — Spatial emsal motoru için mahalle merkez koordinatları.
 * `mahalleler.json` zaten lat/lng içeriyor (OSM/TKGM birleşik kaynak);
 * Nominatim'e ek istek YOK. Tek geçişte 67k+ kayıt → compact tuple TS modülü.
 *
 * Tuple formatı: [lat, lng, confidence]
 *   - lat/lng: 4 ondalık (~11m hassas), ~50 byte/entry
 *   - confidence: 1.0 = mahalle merkezi (OSM verified), 0.6 = village/hamlet
 *     küçük topluluk, 0.4 = ilçe centroid fallback (ileride genişletilebilir)
 *
 * Kullanım:
 *   node scripts/build-mahalle-merkez.mjs
 *
 * Çıktı: ~3-4 MB TS, ~500 KB gzip.
 */

import { writeFileSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAHALLE_JSON = `${__dirname}/../data/mahalleler.json`;
const OUT_TS = `${__dirname}/../src/lib/data/mahalle-merkezleri.ts`;

/**
 * OSM `tip` alanına göre confidence ata.
 * - neighbourhood/suburb/quarter → tipik şehir mahallesi (1.0)
 * - village → köy/mahalle birleşik (0.85)
 * - hamlet → küçük topluluk (0.65)
 * - locality/isolated → düşük (0.5)
 */
function confidenceFor(tip) {
  switch (tip) {
    case "neighbourhood":
    case "suburb":
    case "quarter":
    case "mahalle":
      return 1.0;
    case "village":
      return 0.85;
    case "hamlet":
      return 0.65;
    default:
      return 0.5;
  }
}

function main() {
  console.log(`[mahalle-merkez] Okuyor: ${MAHALLE_JSON}`);
  const raw = JSON.parse(readFileSync(MAHALLE_JSON, "utf8"));
  console.log(`[mahalle-merkez] ${raw.length} mahalle ham`);

  /** @type {Record<string, [number, number, number]>} */
  const tuples = {};
  let skip = 0;
  let dup = 0;

  for (const m of raw) {
    if (!m.ilNorm || !m.ilceNorm || !m.mahalleNorm) {
      skip++;
      continue;
    }
    if (typeof m.lat !== "number" || typeof m.lng !== "number") {
      skip++;
      continue;
    }
    // Türkiye bbox sanity (35–43°N, 25–46°E)
    if (m.lat < 35 || m.lat > 43 || m.lng < 25 || m.lng > 46) {
      skip++;
      continue;
    }
    const key = `${m.ilNorm}__${m.ilceNorm}__${m.mahalleNorm}`;
    if (key in tuples) {
      dup++;
      continue;
    }
    const conf = confidenceFor(m.tip);
    tuples[key] = [+m.lat.toFixed(4), +m.lng.toFixed(4), conf];
  }

  const yazilan = Object.keys(tuples).length;
  console.log(`[mahalle-merkez] ✓ ${yazilan} yazıldı, ${skip} atlandı, ${dup} duplicate`);

  const tarih = new Date().toISOString().slice(0, 10);

  // Tuple'ları compact string olarak yaz — JSON.stringify ile minify, satır kırma yok
  const tupleStr = JSON.stringify(tuples);

  const out = `/**
 * Mahalle merkez koordinatları — IlanGozlem backward-fill için.
 *
 * Bu dosya \`scripts/build-mahalle-merkez.mjs\` tarafından üretilir.
 * **Manuel düzenleme YAPMAYIN** — script tekrar çalıştırıldığında üzerine yazılır.
 *
 * Tuple: [lat, lng, confidence]
 *   - confidence ≥0.85 → seviye "mahalle"
 *   - confidence <0.85 → seviye "ilce-fallback" (spatial motor düşük ağırlık)
 *
 * Toplam ${yazilan} entry. Üretim: ${tarih}.
 */

import { normalizeYerAdi } from "../tkgm-api";

export type MahalleMerkezTuple = readonly [lat: number, lng: number, confidence: number];

export const MERKEZ_TUPLES: Readonly<Record<string, MahalleMerkezTuple>> = ${tupleStr};

export const MERKEZ_DATA_TARIHI = "${tarih}";

export interface MahalleMerkezSonuc {
  lat: number;
  lng: number;
  confidence: number;
  seviye: "mahalle" | "ilce-fallback";
}

export function getMahalleMerkez(
  ilAd: string | null | undefined,
  ilceAd: string | null | undefined,
  mahalleAd: string | null | undefined,
): MahalleMerkezSonuc | null {
  if (!ilAd || !ilceAd || !mahalleAd) return null;
  const key = \`\${normalizeYerAdi(ilAd)}__\${normalizeYerAdi(ilceAd)}__\${normalizeYerAdi(mahalleAd)}\`;
  const tuple = MERKEZ_TUPLES[key];
  if (!tuple) return null;
  const [lat, lng, confidence] = tuple;
  return {
    lat,
    lng,
    confidence,
    seviye: confidence >= 0.85 ? "mahalle" : "ilce-fallback",
  };
}

export function merkezTabloDoluMu(): boolean {
  return Object.keys(MERKEZ_TUPLES).length > 0;
}
`;

  writeFileSync(OUT_TS, out);
  console.log(`[mahalle-merkez] ✓ Yazıldı: ${OUT_TS} (${(out.length / 1024).toFixed(0)} KB)`);
}

main();
