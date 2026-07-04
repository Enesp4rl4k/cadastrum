#!/usr/bin/env node
/**
 * Mahalle taşkın risk proxy — dere yatağı mesafesi + il bazlı tablo.
 *
 * Kaynak: OSM waterway (river/canal) + mevcut IL_TASKIN (taskin-risk.ts)
 * Resmi DSİ polygon yok — proxy skor; veri yoksa il fallback.
 *
 * Kullanım: node scripts/taskin-proxy-uret.mjs
 * Çıktı: src/lib/data/mahalle-taskin.ts
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildGrid, enYakinKm, overpassFetch, wayNoktalari } from "./lib/geo-utils.mjs";
import { mahalleKey } from "./lib/normalize-tr.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const MAHALLE_JSON = join(ROOT, "data/mahalleler.json");
const TASKIN_TS = join(ROOT, "src/lib/data/taskin-risk.ts");
const NOKTA_CACHE = join(ROOT, "data/.cache-waterway-noktalar.json");
const OUT = join(ROOT, "src/lib/data/mahalle-taskin.ts");

/** Türkiye — 6 bölge (Overpass yanıt / bellek sınırı) */
const BOLGELER = [
  { ad: "marmara", bbox: "40.0,25.7,42.1,31.5" },
  { ad: "ege", bbox: "36.5,25.7,40.0,30.5" },
  { ad: "akdeniz", bbox: "35.8,29.0,37.5,36.5" },
  { ad: "icanadolu", bbox: "37.5,30.5,42.1,36.5" },
  { ad: "karadeniz", bbox: "40.0,31.5,42.1,44.8" },
  { ad: "dogu", bbox: "35.8,36.5,40.0,44.8" },
];

function bolgeQuery(bbox) {
  return `
[out:json][timeout:300];
way["waterway"~"^(river|canal)$"](${bbox});
out geom;
`.trim();
}

/** İl taşkın riski — taskin-risk.ts'ten parse */
function ilTaskinOku() {
  const src = readFileSync(TASKIN_TS, "utf8");
  const map = {};
  const re = /"([^"]+)":\s*\{\s*risk:\s*"(yuksek|orta|dusuk)"/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    map[m[1]] = m[2];
  }
  return map;
}

function riskSkoru(risk) {
  return risk === "yuksek" ? 2 : risk === "orta" ? 1 : 0;
}

function proxyRisk(ilRisk, dereKm) {
  let skor = riskSkoru(ilRisk);
  if (dereKm == null) return skor;
  if (dereKm <= 0.3) skor = Math.min(2, skor + 2);
  else if (dereKm <= 0.8) skor = Math.min(2, skor + 1);
  else if (dereKm <= 2 && ilRisk === "yuksek") skor = Math.max(skor, 1);
  return skor;
}

async function dereNoktalariYukle() {
  if (existsSync(NOKTA_CACHE)) {
    process.stderr.write(`[taskin] nokta cache: ${NOKTA_CACHE}\n`);
    return JSON.parse(readFileSync(NOKTA_CACHE, "utf8"));
  }

  const tumNoktalar = [];
  for (const bolge of BOLGELER) {
    process.stderr.write(`[taskin] Bölge: ${bolge.ad}\n`);
    const data = await overpassFetch(bolgeQuery(bolge.bbox), `waterway-${bolge.ad}`);
    const noktalar = wayNoktalari(data.elements, 12);
    for (const n of noktalar) tumNoktalar.push(n);
    process.stderr.write(`[taskin]   +${noktalar.length} nokta (toplam ${tumNoktalar.length})\n`);
  }

  writeFileSync(NOKTA_CACHE, JSON.stringify(tumNoktalar), "utf8");
  process.stderr.write(`[taskin] Nokta cache yazıldı: ${tumNoktalar.length}\n`);
  return tumNoktalar;
}

async function main() {
  const ilTaskin = ilTaskinOku();
  const mahalleler = JSON.parse(readFileSync(MAHALLE_JSON, "utf8"));
  process.stderr.write(`[taskin] ${mahalleler.length} mahalle, ${Object.keys(ilTaskin).length} il riski\n`);

  const dereNoktalar = await dereNoktalariYukle();
  process.stderr.write(`[taskin] ${dereNoktalar.length} dere örnekleme noktası\n`);
  const grid = buildGrid(dereNoktalar, (n) => n.lat, (n) => n.lng, 0.08);

  const sonuc = {};
  let i = 0;
  let yuksek = 0;
  let orta = 0;

  for (const m of mahalleler) {
    i++;
    if (i % 15000 === 0) process.stderr.write(`[taskin] ${i}/${mahalleler.length}\n`);
    const key = mahalleKey(m.ilNorm, m.ilceNorm, m.mahalleNorm);
    if (!key) continue;

    const ilRisk = ilTaskin[m.ilNorm] ?? "orta";
    const dereKm = enYakinKm(dereNoktalar, grid, m.lat, m.lng, 8);
    const skor = proxyRisk(ilRisk, dereKm);

    // Sadece anlamlı kayıtlar: dere yakın veya il default'tan farklı
    const ilSkor = riskSkoru(ilRisk);
    const dereYakin = dereKm != null && dereKm <= 5;
    if (!dereYakin && skor === ilSkor) continue;

    const dereDeger = dereKm != null && dereKm <= 10 ? +dereKm.toFixed(2) : 0;
    sonuc[key] = [dereDeger, skor];
    if (skor === 2) yuksek++;
    else if (skor === 1) orta++;
  }

  process.stderr.write(`[taskin] ${Object.keys(sonuc).length} mahalle (yüksek=${yuksek}, orta=${orta})\n`);

  const ts = `/**
 * Mahalle taşkın risk proxy — [enYakinDereKm, riskSkoru].
 * riskSkoru: 0=düşük, 1=orta, 2=yüksek
 *
 * Kaynak: OSM waterway + il tablosu (taskin-risk.ts)
 * Üreten: scripts/taskin-proxy-uret.mjs
 * Üretim: ${new Date().toISOString().slice(0, 10)}
 */
export type MahalleTaskinTuple = readonly [dereKm: number, riskSkoru: 0 | 1 | 2];

export const MAHALLE_TASKIN: Readonly<Record<string, MahalleTaskinTuple>> = ${JSON.stringify(sonuc)};
`;
  writeFileSync(OUT, ts, "utf8");
  process.stderr.write(`[taskin] ✓ ${OUT}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
