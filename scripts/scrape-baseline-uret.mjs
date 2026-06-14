#!/usr/bin/env node
/**
 * Emlakjet SQL → ilçe + mahalle baseline (gerçek scraping, kırsal dahil).
 *
 *   node scripts/scrape-baseline-uret.mjs
 *
 * Çıktı:
 *   data/ilce-baseline-scrape.json
 *   data/mahalle-scrape-baseline.json
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const SQL_DOSYALAR = [
  join(ROOT, "scripts/emlakjet-data-turkiye.sql"),
  join(ROOT, "scripts/emlakjet-data-full.sql"),
  join(ROOT, "scripts/emlakjet-data.sql"),
].filter((p) => existsSync(p));

function medyan(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

function parseSql(metin) {
  const kayitlar = [];
  const re =
    /'(?:emlakjet|extension)','ej_([^']+)','([^']*)','([^']*)',([^,]+),(\d+),(\d+),'([^']+)'/g;
  let m;
  while ((m = re.exec(metin)) !== null) {
    const mahRaw = m[4].trim();
    kayitlar.push({
      ilN: m[2],
      ilceN: m[3],
      mahN: mahRaw === "NULL" ? null : mahRaw.replace(/^'|'$/g, ""),
      tlm2: parseInt(m[5], 10),
      m2: parseInt(m[6], 10),
      kategori: m[7],
    });
  }
  return kayitlar.filter((k) => k.tlm2 >= 100 && k.tlm2 <= 5_000_000 && k.m2 >= 50);
}

function guvenFromCount(n, kategori) {
  const taban = kategori === "tarla" ? 28 : 32;
  return Math.min(80, taban + n * 4);
}

const tum = [];
for (const p of SQL_DOSYALAR) {
  console.log(`Okunuyor: ${p}`);
  tum.push(...parseSql(readFileSync(p, "utf8")));
}
console.log(`Toplam geçerli ilan: ${tum.length}`);

// ── IQR outlier filtre (il+kategori bazlı) ──
// Tek-iki ilanlı mahallelerde uç değer baseline'ı bozar. İl bazlı fence ile temizle.
function yuzdelik(arr, p) {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) * p)];
}
const ilKatBucket = {};
for (const k of tum) {
  const key = `${k.ilN}__${k.kategori}`;
  (ilKatBucket[key] ||= []).push(k.tlm2);
}
const fenceMap = {};
for (const [key, arr] of Object.entries(ilKatBucket)) {
  if (arr.length < 10) continue; // az veride fence güvensiz, atla
  const q1 = yuzdelik(arr, 0.25);
  const q3 = yuzdelik(arr, 0.75);
  const iqr = q3 - q1;
  fenceMap[key] = { alt: Math.max(50, q1 - 1.5 * iqr), ust: q3 + 1.5 * iqr };
}
const oncesi = tum.length;
const temiz = tum.filter((k) => {
  const f = fenceMap[`${k.ilN}__${k.kategori}`];
  if (!f) return true;
  return k.tlm2 >= f.alt && k.tlm2 <= f.ust;
});
console.log(`IQR filtre: ${oncesi} → ${temiz.length} (${oncesi - temiz.length} outlier atildi, ${(((oncesi - temiz.length) / oncesi) * 100).toFixed(1)}%)`);
tum.length = 0;
tum.push(...temiz);

// ── İlçe medyan ──
const ilceBucket = {};
for (const k of tum) {
  const key = `${k.ilN}__${k.ilceN}`;
  if (!ilceBucket[key]) ilceBucket[key] = { arsa: [], tarla: [] };
  ilceBucket[key][k.kategori]?.push(k.tlm2);
}

const ilceScrape = { arsa: {}, tarla: {}, meta: {} };
for (const [key, b] of Object.entries(ilceBucket)) {
  for (const seg of ["arsa", "tarla"]) {
    const med = medyan(b[seg] || []);
    if (!med) continue;
    ilceScrape[seg][key] = med;
    ilceScrape.meta[key] = ilceScrape.meta[key] || {};
    ilceScrape.meta[key][seg] = (b[seg] || []).length;
  }
}
console.log(`İlçe scrape: arsa ${Object.keys(ilceScrape.arsa).length}, tarla ${Object.keys(ilceScrape.tarla).length}`);

// ── Mahalle medyan ──
const mahBucket = {};
for (const k of tum) {
  if (!k.mahN) continue;
  const key = `${k.ilN}__${k.ilceN}__${k.mahN}`;
  if (!mahBucket[key]) mahBucket[key] = { arsa: [], tarla: [] };
  mahBucket[key][k.kategori]?.push(k.tlm2);
}

const mahalleScrape = {};
for (const [key, b] of Object.entries(mahBucket)) {
  mahalleScrape[key] = {};
  for (const seg of ["arsa", "tarla", "konut"]) {
    const src = seg === "konut" ? b.arsa : b[seg];
    const med = medyan(src || []);
    if (!med) continue;
    const n = (src || []).length;
    mahalleScrape[key][seg] = {
      tlm2: med,
      guven: guvenFromCount(n, seg === "konut" ? "arsa" : seg),
      kaynak: "emlakjet-scrape",
      ilanAdet: n,
    };
  }
  if (mahalleScrape[key].arsa && !mahalleScrape[key].konut) {
    mahalleScrape[key].konut = {
      tlm2: Math.round(mahalleScrape[key].arsa.tlm2 * 1.35),
      guven: Math.max(25, mahalleScrape[key].arsa.guven - 5),
      kaynak: "emlakjet-scrape",
      ilanAdet: mahalleScrape[key].arsa.ilanAdet,
    };
  }
}
console.log(`Mahalle scrape: ${Object.keys(mahalleScrape).length} mahalle`);

const ilBucket = {};
for (const [key, b] of Object.entries(ilceBucket)) {
  const ilN = key.split("__")[0];
  if (!ilBucket[ilN]) ilBucket[ilN] = { arsa: [], tarla: [] };
  for (const seg of ["arsa", "tarla"]) {
    if (b[seg]?.length) ilBucket[ilN][seg].push(...b[seg]);
  }
}
const ilScrape = { arsa: {}, tarla: {} };
for (const [ilN, b] of Object.entries(ilBucket)) {
  for (const seg of ["arsa", "tarla"]) {
    const med = medyan(b[seg] || []);
    if (med) ilScrape[seg][ilN] = med;
  }
}
ilceScrape.il = ilScrape;

writeFileSync(join(ROOT, "data/ilce-baseline-scrape.json"), JSON.stringify(ilceScrape, null, 2));
writeFileSync(join(ROOT, "data/mahalle-scrape-baseline.json"), JSON.stringify(mahalleScrape, null, 2));
console.log("✓ data/ilce-baseline-scrape.json");
console.log("✓ data/mahalle-scrape-baseline.json");
console.log("Sonraki: node scripts/knn-yumusatma.mjs && node scripts/baseline-ts-uret.mjs");
