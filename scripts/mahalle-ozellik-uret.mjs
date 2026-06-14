#!/usr/bin/env node
/**
 * Mahalle feature vector — 5 özellik (sahil + metro + üniversite + anayol + il merkezi).
 *
 * Kapsam: TÜM mahalleler (şehir + köy + hamlet) — 67k yerleşim
 * Köyler için kritik özellikler: sahil, anayol, il merkezi
 * Şehir mahalleleri için ek: metro, üniversite
 *
 * Kullanım:
 *   node scripts/mahalle-ozellik-uret.mjs
 *
 * Çıktı: src/lib/data/mahalle-ozellik.ts (~500-800 KB ham, ~150 KB gzip)
 *
 * Çalışma süresi: ~10-15 dk (3 Overpass query + lokal grid match)
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAHALLE_DOSYA = `${__dirname}/../data/mahalleler.json`;
const ÇIKTI_TS = `${__dirname}/../src/lib/data/mahalle-ozellik.ts`;
const CACHE_DIR = `${__dirname}/../data`;

// İl merkez koordinatları statik dataset'ten oku
const IL_MERKEZLERI_TS = readFileSync(`${__dirname}/../src/lib/data/il-merkezleri.ts`, "utf8");
const IL_MERKEZLERI = (() => {
  const m = IL_MERKEZLERI_TS.match(/IL_MERKEZLERI[^=]*=\s*({[\s\S]*?\n};)/);
  if (!m) throw new Error("IL_MERKEZLERI parse edilemedi");
  // Güvenli parse: eval yerine basit regex
  const result = {};
  const re = /"([^"]+)"\s*:\s*\[\s*([\d.]+)\s*,\s*([\d.]+)\s*\]/g;
  let match;
  while ((match = re.exec(m[1])) !== null) {
    result[match[1]] = [parseFloat(match[2]), parseFloat(match[3])];
  }
  return result;
})();
console.error(`[ozellik] ${Object.keys(IL_MERKEZLERI).length} il merkez koordinatı yüklendi`);

const OVERPASS_HOSTS = [
  "https://overpass-api.de/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const QUERIES = {
  sahil: `
[out:json][timeout:300];
way["natural"="coastline"](35.8,25.7,42.1,44.8);
out geom;
`.trim(),

  metro: `
[out:json][timeout:300];
(
  node["railway"~"^(subway_entrance|station|halt|tram_stop)$"]["station"!="light_rail"](35.8,25.7,42.1,44.8);
  way["railway"~"^(subway|light_rail|tram)$"](35.8,25.7,42.1,44.8);
);
out center;
`.trim(),

  universite: `
[out:json][timeout:300];
(
  node["amenity"="university"](35.8,25.7,42.1,44.8);
  way["amenity"="university"](35.8,25.7,42.1,44.8);
  rel["amenity"="university"](35.8,25.7,42.1,44.8);
);
out center;
`.trim(),

  // Anayol: sadece motorway + trunk (primary çok yoğun, query zaman aşımı)
  // Mevcut OTOYOL_NOKTALARI dataset'imiz (extract-otoyollar.mjs) primary için zaten reuse edilebilir
  anayol: `
[out:json][timeout:600];
way["highway"~"^(motorway|trunk)$"](35.8,25.7,42.1,44.8);
out geom;
`.trim(),
};

const R = 6371;
const toRad = (d) => (d * Math.PI) / 180;
const haversineKm = (la1, lo1, la2, lo2) => {
  const dLat = toRad(la2 - la1);
  const dLng = toRad(lo2 - lo1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(la1)) * Math.cos(toRad(la2)) * Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

async function overpassFetch(query, label) {
  for (const host of OVERPASS_HOSTS) {
    process.stderr.write(`[${label}] ${new URL(host).host}...\n`);
    try {
      const params = new URLSearchParams({ data: query });
      const res = await fetch(host, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "arsa-tkgm-extension/1.0 (cadastre analysis)",
          "Accept": "application/json",
        },
        body: params.toString(),
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

async function getOrFetch(cacheFile, query, label) {
  if (existsSync(cacheFile)) {
    process.stderr.write(`[${label}] cache: ${cacheFile}\n`);
    return JSON.parse(readFileSync(cacheFile, "utf8"));
  }
  const data = await overpassFetch(query, label);
  if (!existsSync(dirname(cacheFile))) mkdirSync(dirname(cacheFile), { recursive: true });
  writeFileSync(cacheFile, JSON.stringify(data), "utf8");
  return data;
}

function buildGrid(items, getLat, getLng, hucreBoy = 0.1) {
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

function enYakinKm(noktaList, grid, lat, lng, maxKm) {
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

async function main() {
  process.stderr.write("[ozellik] Mahalleler okunuyor...\n");
  const mahalleler = JSON.parse(readFileSync(MAHALLE_DOSYA, "utf8"));
  process.stderr.write(`[ozellik] ${mahalleler.length} toplam mahalle (köy + hamlet dahil)\n`);

  const sehirTipleri = new Set(["neighbourhood", "suburb", "quarter"]);

  // 1. SAHIL
  const sahilData = await getOrFetch(`${CACHE_DIR}/.cache-sahil.json`, QUERIES.sahil, "sahil");
  const sahilNoktalar = [];
  for (const el of sahilData.elements ?? []) {
    if (el.type !== "way" || !el.geometry) continue;
    for (const g of el.geometry) sahilNoktalar.push({ lat: g.lat, lng: g.lon });
  }
  process.stderr.write(`[ozellik] ${sahilNoktalar.length} sahil noktası\n`);
  const sahilGrid = buildGrid(sahilNoktalar, n => n.lat, n => n.lng);

  // 2. METRO
  const metroData = await getOrFetch(`${CACHE_DIR}/.cache-metro.json`, QUERIES.metro, "metro");
  const metroNoktalar = [];
  for (const el of metroData.elements ?? []) {
    if (el.type === "node") metroNoktalar.push({ lat: el.lat, lng: el.lon });
    else if (el.center) metroNoktalar.push({ lat: el.center.lat, lng: el.center.lon });
  }
  process.stderr.write(`[ozellik] ${metroNoktalar.length} metro noktası\n`);
  const metroGrid = buildGrid(metroNoktalar, n => n.lat, n => n.lng);

  // 3. ÜNİVERSİTE
  const uniData = await getOrFetch(`${CACHE_DIR}/.cache-universite.json`, QUERIES.universite, "universite");
  const uniNoktalar = [];
  for (const el of uniData.elements ?? []) {
    if (el.type === "node") uniNoktalar.push({ lat: el.lat, lng: el.lon });
    else if (el.center) uniNoktalar.push({ lat: el.center.lat, lng: el.center.lon });
  }
  process.stderr.write(`[ozellik] ${uniNoktalar.length} üniversite\n`);
  const uniGrid = buildGrid(uniNoktalar, n => n.lat, n => n.lng);

  // 4. ANAYOL (motorway + trunk + primary)
  const yolData = await getOrFetch(`${CACHE_DIR}/.cache-anayol.json`, QUERIES.anayol, "anayol");
  const yolNoktalar = [];
  for (const el of yolData.elements ?? []) {
    if (el.type !== "way" || !el.geometry) continue;
    // Her ~500m'de bir nokta sample (yol çok uzun olduğu için)
    for (let i = 0; i < el.geometry.length; i += 5) {
      yolNoktalar.push({ lat: el.geometry[i].lat, lng: el.geometry[i].lon });
    }
  }
  process.stderr.write(`[ozellik] ${yolNoktalar.length} anayol noktası\n`);
  const yolGrid = buildGrid(yolNoktalar, n => n.lat, n => n.lng);

  // 5. Mahalle başına özellik vector
  const sonuc = {};
  let i = 0;
  let kapsananKoy = 0;

  for (const m of mahalleler) {
    i++;
    if (i % 10000 === 0) process.stderr.write(`[ozellik] ${i}/${mahalleler.length}\n`);
    if (!m.ilNorm || !m.ilceNorm || !m.mahalleNorm) continue;
    const isSehir = sehirTipleri.has(m.tip);

    const key = `${m.ilNorm}__${m.ilceNorm}__${m.mahalleNorm}`;

    // Mesafeler
    const sahilKm = enYakinKm(sahilNoktalar, sahilGrid, m.lat, m.lng, 50);
    const yolKm = enYakinKm(yolNoktalar, yolGrid, m.lat, m.lng, 30);

    // Şehir mahalleleri için metro + üniversite
    const metroKm = isSehir ? enYakinKm(metroNoktalar, metroGrid, m.lat, m.lng, 30) : null;
    const uniKm = isSehir ? enYakinKm(uniNoktalar, uniGrid, m.lat, m.lng, 20) : null;

    // İl merkezine mesafe (tüm mahalleler için)
    const ilMerkez = IL_MERKEZLERI[m.ilNorm];
    const ilKm = ilMerkez ? haversineKm(m.lat, m.lng, ilMerkez[0], ilMerkez[1]) : null;

    // Eşik altı = 0 (bundle bloat azaltır)
    const sahilDeger = sahilKm != null && sahilKm <= 5 ? +sahilKm.toFixed(2) : 0;
    const metroDeger = metroKm != null && metroKm <= 1.5 ? +metroKm.toFixed(2) : 0;
    const uniDeger = uniKm != null && uniKm <= 2 ? +uniKm.toFixed(2) : 0;
    const yolDeger = yolKm != null && yolKm <= 5 ? +yolKm.toFixed(2) : 0;
    // İl merkezi için 100km'ye kadar kaydet (köyler için kritik)
    const ilDeger = ilKm != null && ilKm <= 100 ? +ilKm.toFixed(1) : 0;

    // Hepsi 0 ise atla (sadece köyler için kritik veri var)
    if (sahilDeger === 0 && metroDeger === 0 && uniDeger === 0 && yolDeger === 0 && ilDeger === 0) continue;

    sonuc[key] = [sahilDeger, metroDeger, uniDeger, yolDeger, ilDeger];
    if (!isSehir) kapsananKoy++;
  }

  // İstatistikler
  let sahilYakin = 0, metroYakin = 0, uniYakin = 0, yolYakin = 0, ilMerkezYakin = 0;
  for (const t of Object.values(sonuc)) {
    if (t[0] > 0 && t[0] < 2) sahilYakin++;
    if (t[1] > 0 && t[1] < 1) metroYakin++;
    if (t[2] > 0 && t[2] < 2) uniYakin++;
    if (t[3] > 0 && t[3] < 1) yolYakin++;
    if (t[4] > 0 && t[4] < 30) ilMerkezYakin++;
  }
  process.stderr.write(`[ozellik] ${Object.keys(sonuc).length} mahalle (köy/hamlet: ${kapsananKoy})\n`);
  process.stderr.write(`[ozellik] Sahile <2km: ${sahilYakin} | Metroya <1km: ${metroYakin} | Üniv <2km: ${uniYakin} | Anayol <1km: ${yolYakin} | İl merkez <30km: ${ilMerkezYakin}\n`);

  // TS dosyası üret
  const ts = `/**
 * Mahalle feature vector — 5 öznitelik mesafesi (km).
 * Üretildi: ${new Date().toISOString().slice(0, 10)}
 *
 * Format: [sahilKm, metroKm, universiteKm, anayolKm, ilMerkezKm]
 *   - 0 değer = "uzak" (eşiklerin altında değil)
 *   - sahil: 0-5km (yakın değerli)
 *   - metro: 0-1.5km (sadece şehir mahalleleri)
 *   - üniversite: 0-2km (sadece şehir mahalleleri)
 *   - anayol: 0-5km (motorway/trunk/primary)
 *   - il merkez: 0-100km (köyler için kritik)
 *
 * Toplam ${Object.keys(sonuc).length} mahalle (${kapsananKoy} köy/hamlet dahil).
 *
 * Üreten: scripts/mahalle-ozellik-uret.mjs
 * Kaynak: OpenStreetMap (ODbL)
 */
export type MahalleOzellikTuple = readonly [
  sahilKm: number,
  metroKm: number,
  universiteKm: number,
  anayolKm: number,
  ilMerkezKm: number,
];

export const MAHALLE_OZELLIK: Readonly<Record<string, MahalleOzellikTuple>> = ${JSON.stringify(sonuc)};

/** Yakınlık eşikleri — feature multiplier'larında kullanılır */
export const OZELLIK_ESIK = {
  sahilYakin: 2,        // sahile <2km premium
  metroYakin: 0.5,      // metroya <500m premium (şehir)
  universiteYakin: 1,   // üniversiteye <1km premium (şehir)
  anayolYakin: 1,       // anayola <1km premium (köy için kritik)
  ilMerkezYakin: 15,    // il merkezine <15km premium (köy için)
} as const;
`;

  if (!existsSync(dirname(ÇIKTI_TS))) mkdirSync(dirname(ÇIKTI_TS), { recursive: true });
  writeFileSync(ÇIKTI_TS, ts, "utf8");
  process.stderr.write(`[ozellik] ✓ ${ÇIKTI_TS} (${(ts.length / 1024).toFixed(0)} KB)\n`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
