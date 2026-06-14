#!/usr/bin/env node
/**
 * KNN coğrafi yumuşatma — mahalleler için baseline interpolation.
 *
 * Girdi:
 *   data/mahalleler.json — 67k mahalle (lat/lng + il/ilçe)
 *   data/mahalle-ai-arastirma.json (opsiyonel) — AI'dan gelen seed
 *   src/lib/data/ilce-baseline.ts'den ILCE_BASELINE_ARSA — fallback seed
 *
 * Çıktı:
 *   data/mahalle-baseline-final.json — birleşik baseline
 *
 * Algoritma:
 *   1. Seed'i topla:
 *      - AI verisi (yüksek güven) → primary
 *      - ilçe baseline × ilçedeki tüm mahalleler (düşük güven) → fallback seed
 *   2. Her mahalle için K=5 en yakın seed komşudan ağırlıklı ortalama
 *   3. Maksimum mesafe: 15 km (üzerinde ise ilçe baseline kullan)
 *   4. Güven skoru: komşu yoğunluğu + mesafeyle ters orantılı
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAHALLE_DOSYA = `${__dirname}/../data/mahalleler.json`;
const AI_DOSYA = `${__dirname}/../data/mahalle-ai-arastirma.json`;
const SCRAPE_MAH_DOSYA = `${__dirname}/../data/mahalle-scrape-baseline.json`;
const SCRAPE_ILCE_DOSYA = `${__dirname}/../data/ilce-baseline-scrape.json`;
const ILCE_BASELINE_TS = `${__dirname}/../src/lib/data/ilce-baseline.ts`;
const ÇIKTI = `${__dirname}/../data/mahalle-baseline-final.json`;

const K = 7;
const MAKS_MESAFE_KM = 25;
const MAKS_MESAFE_KIRSAL_KM = 35;
const SEGMENTLER = ["arsa", "konut", "tarla"];

// Haversine
const R_DUNYA = 6371;
function toRad(d) { return (d * Math.PI) / 180; }
function haversineKm(la1, lo1, la2, lo2) {
  const dLat = toRad(la2 - la1);
  const dLng = toRad(lo2 - lo1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(la1)) * Math.cos(toRad(la2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_DUNYA * Math.asin(Math.sqrt(a));
}

/** ILCE_BASELINE_ARSA / ILCE_BASELINE_TARLA tablo'sunu TS dosyasından parse et. */
function parseIlceBaselineTS() {
  const ts = readFileSync(ILCE_BASELINE_TS, "utf8");
  const result = { arsa: {}, tarla: {} };

  for (const segment of ["ARSA", "TARLA"]) {
    const re = new RegExp(
      `ILCE_BASELINE_${segment}\\s*:\\s*Record<string,\\s*number>\\s*=\\s*\\{([\\s\\S]*?)\\n\\};`,
      "m"
    );
    const m = ts.match(re);
    if (!m) continue;
    const body = m[1];
    const entryRe = /"([^"]+)"\s*:\s*([0-9_]+)\s*,?/g;
    let em;
    while ((em = entryRe.exec(body)) !== null) {
      result[segment.toLowerCase()][em[1]] = +em[2].replace(/_/g, "");
    }
  }
  return result;
}

/** Spatial grid — KNN sorgu hızı için 0.1° hücre. */
function buildGrid(items, getLat, getLng, hucreBoy = 0.1) {
  const grid = new Map();
  items.forEach((item, i) => {
    const lat = getLat(item);
    const lng = getLng(item);
    const key = `${Math.floor(lat / hucreBoy)}_${Math.floor(lng / hucreBoy)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(i);
  });
  return { grid, hucreBoy };
}

function gridKomsular(grid, lat, lng, mesafeKm) {
  const dehucre = Math.ceil(mesafeKm / 8 / grid.hucreBoy); // ~8km lat, 1° = 111km
  const cellLat = Math.floor(lat / grid.hucreBoy);
  const cellLng = Math.floor(lng / grid.hucreBoy);
  const idxler = [];
  for (let dy = -dehucre; dy <= dehucre; dy++) {
    for (let dx = -dehucre; dx <= dehucre; dx++) {
      const key = `${cellLat + dy}_${cellLng + dx}`;
      const arr = grid.grid.get(key);
      if (arr) idxler.push(...arr);
    }
  }
  return idxler;
}

async function main() {
  // 1. Veriyi oku
  process.stderr.write(`[knn] Mahalleler okunuyor...\n`);
  const tum = JSON.parse(readFileSync(MAHALLE_DOSYA, "utf8"));
  const sehirTipleri = new Set(["neighbourhood", "suburb", "quarter"]);
  const sehirMahalleleri = tum.filter(m => sehirTipleri.has(m.tip) && m.il);
  const koyTumu = tum.filter(m => !sehirTipleri.has(m.tip));
  process.stderr.write(`[knn] ${sehirMahalleleri.length} şehir mahallesi, ${koyTumu.length} köy/hamlet\n`);

  let aiSeed = {};
  if (existsSync(AI_DOSYA)) {
    aiSeed = JSON.parse(readFileSync(AI_DOSYA, "utf8"));
    process.stderr.write(`[knn] AI seed (atlanacak üretimde): ${Object.keys(aiSeed).length}\n`);
  }

  let scrapeMah = {};
  if (existsSync(SCRAPE_MAH_DOSYA)) {
    scrapeMah = JSON.parse(readFileSync(SCRAPE_MAH_DOSYA, "utf8"));
    process.stderr.write(`[knn] Scrape mahalle seed: ${Object.keys(scrapeMah).length}\n`);
  }

  let scrapeIlce = { arsa: {}, tarla: {}, il: { arsa: {}, tarla: {} } };
  if (existsSync(SCRAPE_ILCE_DOSYA)) {
    scrapeIlce = JSON.parse(readFileSync(SCRAPE_ILCE_DOSYA, "utf8"));
    process.stderr.write(
      `[knn] Scrape ilçe: arsa ${Object.keys(scrapeIlce.arsa || {}).length}, tarla ${Object.keys(scrapeIlce.tarla || {}).length}\n`,
    );
  }

  const ilceBaseline = parseIlceBaselineTS();
  for (const seg of ["arsa", "tarla"]) {
    for (const [k, v] of Object.entries(scrapeIlce[seg] || {})) {
      if (!ilceBaseline[seg][k]) ilceBaseline[seg][k] = v;
    }
  }
  process.stderr.write(`[knn] İlçe baseline (manuel+scrape): arsa ${Object.keys(ilceBaseline.arsa).length}, tarla ${Object.keys(ilceBaseline.tarla).length}\n`);

  // 4. Sonuç tablosu hazırla
  // Format: { mahalleKey: { arsa: {tlm2, guven, kaynak}, konut: {...}, tarla: {...} } }
  const sonuc = {};

  // 4a. Gerçek scrape mahalle (öncelik — AI yok)
  for (const [key, segs] of Object.entries(scrapeMah)) {
    sonuc[key] = { ...sonuc[key] };
    for (const seg of SEGMENTLER) {
      if (segs[seg]?.tlm2 > 0) {
        sonuc[key][seg] = { ...segs[seg], kaynak: "emlakjet-scrape" };
      }
    }
  }

  // 5. KNN smoothing — AI seed'inden + spatial interpolation
  // Şehir mahalleleri için: yakın mahalleler arasında KNN
  process.stderr.write(`[knn] Şehir mahalleleri için KNN hesaplanıyor...\n`);

  // Seed olarak: AI verisi olan mahalleler + ilçe baseline'lı tüm şehir mahalleleri
  const seedItemler = [];
  for (const m of sehirMahalleleri) {
    const key = `${m.ilNorm}__${m.ilceNorm}__${m.mahalleNorm}`;
    const ilceKey = `${m.ilNorm}__${m.ilceNorm}`;
    const aiVeri = aiSeed[key];

    for (const seg of ["arsa", "konut", "tarla"]) {
      const segMap = seg === "konut" ? ilceBaseline.arsa : ilceBaseline[seg]; // konut için arsa baseline kullan (yoksa)
      const ilceFiyat = segMap?.[ilceKey];

      let fiyat = null;
      let guven = 0;

      const scrapeVeri = scrapeMah[key]?.[seg];
      if (scrapeVeri?.tlm2 > 0) {
        fiyat = scrapeVeri.tlm2;
        guven = scrapeVeri.guven ?? 55;
      } else if (ilceFiyat) {
        fiyat = ilceFiyat;
        guven = scrapeIlce.meta?.[ilceKey]?.[seg] >= 5 ? 42 : 35;
      }

      if (fiyat) {
        seedItemler.push({
          key, seg, lat: m.lat, lng: m.lng,
          fiyat, guven,
          kaynak: scrapeVeri?.tlm2 ? "scrape" : "ilce-fallback",
        });
      }
    }
  }
  process.stderr.write(`[knn] Seed: ${seedItemler.length} (mahalle×segment)\n`);

  // Segmente göre ayır, her segment için ayrı grid
  const seedBySeg = { arsa: [], konut: [], tarla: [] };
  for (const s of seedItemler) seedBySeg[s.seg].push(s);

  const gridBySeg = {};
  for (const seg of SEGMENTLER) {
    gridBySeg[seg] = buildGrid(seedBySeg[seg], s => s.lat, s => s.lng);
  }

  // 6. Her şehir mahallesi için KNN smoothing
  let i = 0;
  for (const m of sehirMahalleleri) {
    i++;
    if (i % 5000 === 0) process.stderr.write(`[knn] ${i}/${sehirMahalleleri.length}...\n`);
    const key = `${m.ilNorm}__${m.ilceNorm}__${m.mahalleNorm}`;
    if (!sonuc[key]) sonuc[key] = {};

    for (const seg of SEGMENTLER) {
      if (sonuc[key][seg]?.kaynak === "emlakjet-scrape") continue;

      const seedList = seedBySeg[seg];
      const grid = gridBySeg[seg];
      const idxler = gridKomsular(grid, m.lat, m.lng, MAKS_MESAFE_KM);

      // En yakın K komşu bul
      const distler = [];
      for (const idx of idxler) {
        const seed = seedList[idx];
        if (!seed) continue;
        if (seed.key === key) continue; // kendisi
        const d = haversineKm(m.lat, m.lng, seed.lat, seed.lng);
        if (d > MAKS_MESAFE_KM) continue;
        distler.push({ d, seed });
      }

      if (distler.length === 0) continue;

      distler.sort((a, b) => a.d - b.d);
      const top = distler.slice(0, K);

      // Inverse distance weighted average + güven ağırlığı
      let toplamAgirlik = 0;
      let toplamFiyat = 0;
      let aiKomsuVar = false;
      for (const { d, seed } of top) {
        const agirlik = (1 / Math.max(d, 0.1) ** 2) * (seed.guven / 100);
        toplamAgirlik += agirlik;
        toplamFiyat += seed.fiyat * agirlik;
        if (seed.kaynak === "ai") aiKomsuVar = true;
      }

      if (toplamAgirlik <= 0) continue;
      const fiyat = toplamFiyat / toplamAgirlik;
      const ortMesafe = top.reduce((a, b) => a + b.d, 0) / top.length;

      // Güven: komşu sayısı + ortalama mesafe + en az bir AI komşu var mı
      let guven = Math.min(60, top.length * 8); // base
      guven += aiKomsuVar ? 10 : 0;
      guven -= Math.min(20, ortMesafe); // her km -1
      guven = Math.max(15, Math.min(75, Math.round(guven)));

      sonuc[key][seg] = {
        tlm2: Math.round(fiyat),
        guven,
        kaynak: "knn-smoothing",
      };
    }
  }

  // 7. Köy/hamlet için il-tarla-baseline (kırsal kalibrasyon)
  // ÖNCEKİ MANTIK YANLIŞTI: ilce_arsa × 0.5 → Konya köyü 2000 TL/m² (gerçek 200)
  // YENİ: il-tarla-baseline × tip_carpan + il_arsa fallback
  // Konya: il_tarla=200, köy_arsa=200×1.5=300 (1500'den 10x iyi)
  // İstanbul Şile: il_tarla=2500, köy_arsa=3750 (kıyıdaki köyler değerli)

  const IL_TARLA_MANUEL = {
    istanbul: 2500, ankara: 900, izmir: 1500, antalya: 1500, mugla: 1300,
    bursa: 800, kocaeli: 700, sakarya: 500, tekirdag: 500, yalova: 800,
    adana: 350, mersin: 500, gaziantep: 250, konya: 200, kayseri: 200,
    eskisehir: 350, diyarbakir: 120, samsun: 300, trabzon: 600, sanliurfa: 100,
    hatay: 350, manisa: 350, balikesir: 500, denizli: 300, erzurum: 80,
    kahramanmaras: 180, malatya: 130, mardin: 100, van: 80, ordu: 350,
  };
  const FALLBACK_TARLA = 200;
  const IL_TARLA_BASELINE = { ...IL_TARLA_MANUEL, ...(scrapeIlce.il?.tarla || {}) };

  const TIP_CARPAN = { village: 1.0, hamlet: 0.65, suburb: 0.85 };
  const ARSA_ILCE_ORAN = { village: 0.22, hamlet: 0.14, suburb: 0.35 };

  process.stderr.write(`[knn] Köy/hamlet için il-tarla-baseline (kırsal kalibre)\n`);
  for (const m of koyTumu) {
    if (!m.il) continue;
    const key = `${m.ilNorm}__${m.ilceNorm}__${m.mahalleNorm}`;
    const ilceKey = `${m.ilNorm}__${m.ilceNorm}`;
    if (!sonuc[key]) sonuc[key] = {};

    const ilTarla = IL_TARLA_BASELINE[m.ilNorm] ?? FALLBACK_TARLA;
    const tipCarpan = TIP_CARPAN[m.tip] ?? 0.55;
    const arsaOran = ARSA_ILCE_ORAN[m.tip] ?? 0.18;

    const ilceTarla = scrapeIlce.tarla?.[ilceKey] ?? ilceBaseline.tarla?.[ilceKey];
    const ilceArsa = scrapeIlce.arsa?.[ilceKey] ?? ilceBaseline.arsa?.[ilceKey];
    const tarlaBaz = ilceTarla ?? ilTarla;

    if (!sonuc[key].tarla) {
      sonuc[key].tarla = {
        tlm2: Math.round(tarlaBaz * tipCarpan),
        guven: ilceTarla ? 38 : 28,
        kaynak: "kirsal-tarla-baseline",
      };
    }

    if (!sonuc[key].arsa) {
      let arsaTahmin;
      if (ilceArsa) {
        arsaTahmin = ilceArsa * arsaOran;
      } else {
        arsaTahmin = tarlaBaz * 1.8 * tipCarpan;
      }
      arsaTahmin = Math.max(150, Math.round(arsaTahmin));
      sonuc[key].arsa = {
        tlm2: arsaTahmin,
        guven: ilceArsa ? 32 : 26,
        kaynak: "kirsal-arsa-baseline",
      };
    }

    if (!sonuc[key].konut && sonuc[key].arsa) {
      sonuc[key].konut = {
        tlm2: Math.round(sonuc[key].arsa.tlm2 * 1.3),
        guven: Math.max(22, sonuc[key].arsa.guven - 4),
        kaynak: "kirsal-arsa-baseline",
      };
    }
  }

  // 7b. Köy/hamlet — scrape komşu KNN (seyrek alanlar)
  process.stderr.write(`[knn] Köy/hamlet KNN (scrape komşuları)...\n`);
  const koyKoord = new Map(koyTumu.map((m) => [`${m.ilNorm}__${m.ilceNorm}__${m.mahalleNorm}`, m]));
  const koySeed = [];
  for (const [key, segs] of Object.entries(scrapeMah)) {
    const m = koyKoord.get(key) || sehirMahalleleri.find(
      (x) => `${x.ilNorm}__${x.ilceNorm}__${x.mahalleNorm}` === key,
    );
    if (!m) continue;
    for (const seg of ["arsa", "tarla"]) {
      if (segs[seg]?.tlm2 > 0) {
        koySeed.push({
          key, seg, lat: m.lat, lng: m.lng,
          fiyat: segs[seg].tlm2, guven: segs[seg].guven ?? 50, kaynak: "scrape",
        });
      }
    }
  }
  if (koySeed.length > 0) {
    const koyGrid = buildGrid(koySeed, (s) => s.lat, (s) => s.lng);
    let ki = 0;
    for (const m of koyTumu) {
      ki++;
      const key = `${m.ilNorm}__${m.ilceNorm}__${m.mahalleNorm}`;
      if (sonuc[key]?.arsa?.kaynak === "emlakjet-scrape") continue;
      if (!sonuc[key]) sonuc[key] = {};
      for (const seg of ["arsa", "tarla"]) {
        if (sonuc[key][seg]?.kaynak === "emlakjet-scrape") continue;
        const idxler = gridKomsular(koyGrid, m.lat, m.lng, MAKS_MESAFE_KIRSAL_KM);
        const distler = [];
        for (const idx of idxler) {
          const seed = koySeed[idx];
          if (!seed || seed.seg !== seg) continue;
          const d = haversineKm(m.lat, m.lng, seed.lat, seed.lng);
          if (d > MAKS_MESAFE_KIRSAL_KM) continue;
          distler.push({ d, seed });
        }
        if (distler.length < 2) continue;
        distler.sort((a, b) => a.d - b.d);
        const top = distler.slice(0, K);
        let w = 0, f = 0;
        for (const { d, seed } of top) {
          const ag = (1 / Math.max(d, 0.2) ** 2) * (seed.guven / 100);
          w += ag;
          f += seed.fiyat * ag;
        }
        if (w <= 0) continue;
        const tahmin = Math.round(f / w);
        if (tahmin < 100) continue;
        sonuc[key][seg] = {
          tlm2: tahmin,
          guven: Math.min(55, 20 + top.length * 6),
          kaynak: "knn-smoothing",
        };
      }
    }
    process.stderr.write(`[knn] Köy KNN bitti (${ki} köy)\n`);
  }

  // İstatistikler
  const stats = { ai: 0, knn: 0, ilce: 0, koy: 0, toplam: 0 };
  for (const segs of Object.values(sonuc)) {
    for (const v of Object.values(segs)) {
      stats.toplam++;
      if (v.kaynak === "ai-research") stats.ai++;
      else if (v.kaynak === "knn-smoothing") stats.knn++;
      else if (v.kaynak === "ilce-koy-fallback") stats.koy++;
    }
  }
  process.stderr.write(`[knn] İstatistik: ${stats.toplam} toplam (AI: ${stats.ai}, KNN: ${stats.knn}, köy: ${stats.koy})\n`);
  process.stderr.write(`[knn] Mahalle sayısı: ${Object.keys(sonuc).length}\n`);

  writeFileSync(ÇIKTI, JSON.stringify(sonuc, null, 2), "utf8");
  process.stderr.write(`[knn] ✓ ${ÇIKTI} (${(JSON.stringify(sonuc).length / 1024 / 1024).toFixed(2)} MB)\n`);
}

main().catch((e) => {
  console.error(`HATA: ${e.message}\n${e.stack}`);
  process.exit(1);
});
