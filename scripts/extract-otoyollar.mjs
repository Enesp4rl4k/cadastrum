#!/usr/bin/env node
/**
 * Türkiye otoyol + trunk (D-yol) çıkarıcı.
 *
 * OSM Overpass'tan Türkiye genelindeki tüm motorway + trunk way'lerini çeker,
 * her ~1 km'de bir örneklenmiş nokta üreterek statik dataset'e dönüştürür.
 *
 * Çalıştırma:
 *   node scripts/extract-otoyollar.mjs
 *
 * Çıktı:
 *   src/lib/data/otoyollar.ts   (~80-150 KB gzipli)
 *
 * Kaynak: OpenStreetMap (ODbL) — © OSM contributors
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ÇIKTI = `${__dirname}/../src/lib/data/otoyollar.ts`;

// Global Overpass mirror'ları — osm.ch sadece İsviçre/Avrupa, Türkiye için uygun değil
const OVERPASS_HOSTS = [
  "https://overpass-api.de/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

// Sadece motorway (O-1, O-2, TEM, ...) statik bundle'a giriyor.
// Trunk (D-yolları, 37k+ segment) live Overpass 30km query'den geliyor —
// statik trunk bundle'ı 3+ MB şişirir, service worker startup için ağır.
// Motorway-only: ~12k nokta, ~780 KB ham, ~140 KB gzip — uygun boyut.
const TR_BBOX = "35.8,25.7,42.1,44.8";
const QUERY = `
[out:json][timeout:120];
(
  way["highway"="motorway"](${TR_BBOX});
);
out geom;
`.trim();

// 1 km örnekleme — motorway-only, sayı az, hassasiyet önemli
const ÖRNEK_ARALIK_M = 1000;
const R_DUNYA = 6371000;

function toRad(d) { return (d * Math.PI) / 180; }

function haversineM(la1, lo1, la2, lo2) {
  const dLat = toRad(la2 - la1);
  const dLng = toRad(lo2 - lo1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(la1)) * Math.cos(toRad(la2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_DUNYA * Math.asin(Math.sqrt(a));
}

/** Polyline'ı sabit aralıkla örnekle — Douglas-Peucker yerine basit eşit-aralık */
function poliliniÖrnekle(geom, aralikM) {
  if (!geom || geom.length < 2) return [];
  const noktalar = [];
  let kalanMesafe = 0;
  noktalar.push([geom[0].lat, geom[0].lon]);

  for (let i = 1; i < geom.length; i++) {
    const a = geom[i - 1];
    const b = geom[i];
    const segM = haversineM(a.lat, a.lon, b.lat, b.lon);
    let kullanilmis = -kalanMesafe;
    while (kullanilmis + aralikM <= segM) {
      kullanilmis += aralikM;
      const t = kullanilmis / segM;
      const lat = a.lat + (b.lat - a.lat) * t;
      const lon = a.lon + (b.lon - a.lon) * t;
      noktalar.push([lat, lon]);
    }
    kalanMesafe = segM - kullanilmis;
  }
  return noktalar;
}

async function overpassFetch() {
  for (const host of OVERPASS_HOSTS) {
    process.stderr.write(`[arsa-otoyol] ${new URL(host).host} deneniyor...\n`);
    try {
      const params = new URLSearchParams({ data: QUERY });
      const res = await fetch(host, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "arsa-tkgm-extension/1.0 (cadastre analysis tool; contact: github.com/arsa-tkgm)",
          "Accept": "application/json",
        },
        body: params.toString(),
        signal: AbortSignal.timeout(620_000), // 600s server timeout + buffer
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        process.stderr.write(`  → HTTP ${res.status}: ${txt.slice(0, 200)}\n`);
        continue;
      }
      const data = await res.json();
      const count = data.elements?.length ?? 0;
      process.stderr.write(`  → ${count} way alındı\n`);
      if (count === 0) {
        process.stderr.write(`  → Sonuç boş, sonraki mirror deneniyor...\n`);
        continue; // boş sonuç = bu mirror Türkiye'yi kapsamıyor olabilir
      }
      return data;
    } catch (e) {
      process.stderr.write(`  → ${e.message}\n`);
    }
  }
  throw new Error("Tüm Overpass mirror'ları başarısız veya boş sonuç döndürdü.");
}

async function main() {
  const data = await overpassFetch();
  const elements = data.elements ?? [];

  /** @type {{ tip: "motorway"|"trunk"; ad: string; lat: number; lng: number }[]} */
  const noktalar = [];
  let mwCount = 0, trCount = 0;

  for (const el of elements) {
    if (el.type !== "way" || !el.geometry) continue;
    const tip = el.tags?.highway === "motorway" ? "motorway"
              : el.tags?.highway === "trunk" ? "trunk"
              : null;
    if (!tip) continue;
    const ad = el.tags?.ref ?? el.tags?.name ?? (tip === "motorway" ? "Otoyol" : "Devlet yolu");

    const samples = poliliniÖrnekle(el.geometry, ÖRNEK_ARALIK_M);
    for (const [lat, lng] of samples) {
      noktalar.push({ tip, ad, lat: +lat.toFixed(5), lng: +lng.toFixed(5) });
    }
    if (tip === "motorway") mwCount++;
    else trCount++;
  }

  process.stderr.write(
    `[arsa-otoyol] ${mwCount} motorway way + ${trCount} trunk way → ${noktalar.length} sampled point\n`,
  );

  // Spatial grid index — 0.1° hücre (~10 km × 8 km)
  // Format: { "lat0_lng0": [pointIdx, ...] }
  const HUCRE_BOY = 0.1;
  const grid = {};
  noktalar.forEach((n, i) => {
    const key = `${Math.floor(n.lat / HUCRE_BOY)}_${Math.floor(n.lng / HUCRE_BOY)}`;
    (grid[key] ??= []).push(i);
  });

  // Bundle minimize: noktaları flat array olarak yaz (her nokta 4 element)
  // [tip0, lat, lng, adIdx, tip1, lat, lng, adIdx, ...] format'ı çok kompakt
  // Ama runtime'da kolay erişim için object array tercih edildi
  const ts = `/** Türkiye otoyol + trunk yol örnekli noktalar.
 *  Kaynak: OpenStreetMap (ODbL) — extract-otoyollar.mjs ile üretildi.
 *  Üretim tarihi: ${new Date().toISOString().slice(0, 10)}
 *  Toplam ${noktalar.length} nokta (her ~${ÖRNEK_ARALIK_M}m'de bir).
 *  Spatial grid: ${HUCRE_BOY}° hücreler (${Object.keys(grid).length} hücre).
 */
export type OtoyolNoktasi = { tip: "motorway" | "trunk"; ad: string; lat: number; lng: number };

export const OTOYOL_NOKTALARI: ReadonlyArray<OtoyolNoktasi> = ${JSON.stringify(noktalar)};

export const OTOYOL_GRID_HUCRE_BOY = ${HUCRE_BOY};

/** key = "floor(lat/0.1)_floor(lng/0.1)" → noktalar array'inde index listesi */
export const OTOYOL_GRID: Readonly<Record<string, ReadonlyArray<number>>> = ${JSON.stringify(grid)};
`;

  mkdirSync(dirname(ÇIKTI), { recursive: true });
  writeFileSync(ÇIKTI, ts, "utf8");
  process.stderr.write(`[arsa-otoyol] ✓ ${ÇIKTI} yazıldı (${(ts.length / 1024).toFixed(1)} KB)\n`);
}

main().catch((e) => {
  process.stderr.write(`HATA: ${e.message}\n`);
  process.exit(1);
});
