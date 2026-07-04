#!/usr/bin/env node
/**
 * Mahalle nüfus dataset — TÜİK CSV + OSM population tag + il düzeyi fallback.
 *
 * Kaynaklar (öncelik sırası):
 *   1. data/tuik-adnks-mahalle.csv  (TÜİK ADNKS — nip.tuik.gov.tr)
 *   2. OSM place population tag (Overpass)
 *   3. İl nüfusu / mahalle tipi ağırlığı (il-likidite.ts)
 *
 * Kullanım:
 *   node scripts/nufus-uret.mjs
 *   node scripts/nufus-uret.mjs --atla-overpass   # sadece TÜİK CSV + fallback
 *
 * Çıktı: src/lib/data/mahalle-nufus.ts
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildGrid,
  elementMerkez,
  enYakinKm,
  getOrFetch,
  haversineKm,
} from "./lib/geo-utils.mjs";
import { mahalleKey, normalizeTr, normalizeYerAdi } from "./lib/normalize-tr.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const MAHALLE_JSON = join(ROOT, "data/mahalleler.json");
const TUIK_CSV = join(ROOT, "data/tuik-adnks-mahalle.csv");
const CACHE_OSM = join(ROOT, "data/.cache-osm-nufus.json");
const OUT = join(ROOT, "src/lib/data/mahalle-nufus.ts");
const ESLESMEYEN = join(ROOT, "data/nufus-eslesmeyen.json");

const ATLA_OVERPASS = process.argv.includes("--atla-overpass");

/** İl nüfusu (milyon) — il-likidite.ts ile uyumlu */
const IL_NUFUS_M = {
  istanbul: 16.0, ankara: 5.8, izmir: 4.4, antalya: 2.7, bursa: 3.2,
  adana: 2.3, konya: 2.3, gaziantep: 2.1, kocaeli: 2.1, mersin: 1.9,
  kayseri: 1.4, samsun: 1.4, sanliurfa: 2.2, diyarbakir: 1.8, hatay: 1.7,
  manisa: 1.5, kahramanmaras: 1.2, balikesir: 1.2, aydin: 1.1, tekirdag: 1.1,
  sakarya: 1.0, mugla: 1.1, denizli: 1.1, eskisehir: 0.9, trabzon: 0.8,
  ordu: 0.8, malatya: 0.8, erzurum: 0.8, van: 1.1, afyonkarahisar: 0.74,
  sivas: 0.65, tokat: 0.61, zonguldak: 0.58, kütahya: 0.58, kutahya: 0.58,
  edirne: 0.41, usak: 0.37, corum: 0.53, isparta: 0.44, mardin: 0.87,
  elazig: 0.59, aksaray: 0.43, canakkale: 0.56, kirklareli: 0.36,
};

const OSM_QUERY = `
[out:json][timeout:600];
(
  node["place"]["population"](35.8,25.7,42.1,44.8);
  way["place"]["population"](35.8,25.7,42.1,44.8);
);
out center tags;
`.trim();

const SEHIR_TIPLERI = new Set(["neighbourhood", "suburb", "quarter", "mahalle"]);
const KOY_TIPLERI = new Set(["village", "hamlet"]);

function tipKodu(tip) {
  if (SEHIR_TIPLERI.has(tip)) return 2;
  if (KOY_TIPLERI.has(tip)) return 0;
  return 1;
}

function csvOku(dosya) {
  const text = readFileSync(dosya, "utf8").replace(/^\uFEFF/, "");
  const satirlar = text.split(/\r?\n/).filter((s) => s.trim());
  if (satirlar.length < 2) return new Map();

  const baslik = satirlar[0].split(/[;,]/).map((h) => normalizeTr(h));
  const ilIdx = baslik.findIndex((h) => h.includes("il") && !h.includes("ilce"));
  const ilceIdx = baslik.findIndex((h) => h.includes("ilce"));
  const mahIdx = baslik.findIndex((h) => h.includes("mahalle") || h.includes("koy") || h.includes("yerlesim"));
  const nufusIdx = baslik.findIndex((h) => h.includes("nufus") || h.includes("toplam"));

  if (ilIdx < 0 || ilceIdx < 0 || mahIdx < 0 || nufusIdx < 0) {
    throw new Error(`CSV başlık tanınmadı: ${satirlar[0]}`);
  }

  const map = new Map();
  for (let i = 1; i < satirlar.length; i++) {
    const cols = satirlar[i].split(/[;,]/).map((c) => c.trim().replace(/^"|"$/g, ""));
    const il = normalizeYerAdi(cols[ilIdx]);
    const ilce = normalizeYerAdi(cols[ilceIdx]);
    const mah = normalizeYerAdi(cols[mahIdx]);
    const nufus = parseInt(cols[nufusIdx].replace(/\./g, "").replace(/,/g, ""), 10);
    if (!il || !ilce || !mah || !Number.isFinite(nufus) || nufus <= 0) continue;
    map.set(`${il}__${ilce}__${mah}`, { toplam: nufus, kaynak: "tuik" });
  }
  return map;
}

async function osmNufusOku() {
  if (ATLA_OVERPASS) return [];
  const data = await getOrFetch(CACHE_OSM, OSM_QUERY, "osm-nufus");
  const liste = [];
  for (const el of data.elements ?? []) {
    const tags = el.tags ?? {};
    const pop = parseInt(String(tags.population).replace(/\./g, ""), 10);
    if (!Number.isFinite(pop) || pop <= 0) continue;
    const merkez = elementMerkez(el);
    if (!merkez) continue;
    liste.push({
      ad: normalizeYerAdi(tags.name ?? tags["name:tr"] ?? ""),
      lat: merkez.lat,
      lng: merkez.lng,
      toplam: pop,
      il: normalizeYerAdi(tags["addr:city"] ?? tags["is_in:city"] ?? ""),
    });
  }
  return liste;
}

function osmEslestir(mahalleler, osmListe) {
  const grid = buildGrid(osmListe, (n) => n.lat, (n) => n.lng, 0.05);
  const sonuc = new Map();
  for (const m of mahalleler) {
    const key = mahalleKey(m.ilNorm, m.ilceNorm, m.mahalleNorm);
    if (!key) continue;
    const yakinIdx = gridKomsularYakin(osmListe, grid, m.lat, m.lng, 3);
    let enIyi = null;
    for (const o of yakinIdx) {
      const adUyum = o.ad && (o.ad === m.mahalleNorm || m.mahalleNorm.includes(o.ad) || o.ad.includes(m.mahalleNorm));
      const ilUyum = !o.il || o.il === m.ilNorm;
      const skor = (adUyum ? 10 : 0) + (ilUyum ? 2 : 0) - o.mesafe;
      if (!enIyi || skor > enIyi.skor) enIyi = { ...o, skor };
    }
    if (enIyi && enIyi.skor >= 8) {
      sonuc.set(key, { toplam: enIyi.toplam, kaynak: "osm" });
    }
  }
  return sonuc;
}

function gridKomsularYakin(liste, grid, lat, lng, maxKm) {
  const dehucre = Math.ceil(maxKm / 8 / grid.hucreBoy);
  const cellLat = Math.floor(lat / grid.hucreBoy);
  const cellLng = Math.floor(lng / grid.hucreBoy);
  const sonuc = [];
  for (let dy = -dehucre; dy <= dehucre; dy++) {
    for (let dx = -dehucre; dx <= dehucre; dx++) {
      const arr = grid.grid.get(`${cellLat + dy}_${cellLng + dx}`);
      if (!arr) continue;
      for (const i of arr) {
        const n = liste[i];
        if (!n) continue;
        const mesafe = haversineKm(lat, lng, n.lat, n.lng);
        if (mesafe <= maxKm) sonuc.push({ ...n, mesafe });
      }
    }
  }
  return sonuc;
}

function ilFallbackDagit(mahalleler, mevcut) {
  const ilGruplari = new Map();
  for (const m of mahalleler) {
    const key = mahalleKey(m.ilNorm, m.ilceNorm, m.mahalleNorm);
    if (!key || mevcut.has(key)) continue;
    if (!ilGruplari.has(m.ilNorm)) ilGruplari.set(m.ilNorm, []);
    ilGruplari.get(m.ilNorm).push(m);
  }

  for (const [ilNorm, grup] of ilGruplari) {
    const nufusM = IL_NUFUS_M[ilNorm] ?? 0.35;
    const toplamNufus = Math.round(nufusM * 1_000_000);
    let agirlikToplam = 0;
    const agirliklar = grup.map((m) => {
      const w = SEHIR_TIPLERI.has(m.tip) ? 8 : KOY_TIPLERI.has(m.tip) ? 1 : 3;
      agirlikToplam += w;
      return w;
    });
    grup.forEach((m, i) => {
      const key = mahalleKey(m.ilNorm, m.ilceNorm, m.mahalleNorm);
      const pay = Math.max(50, Math.round((toplamNufus * agirliklar[i]) / agirlikToplam));
      mevcut.set(key, { toplam: pay, kaynak: "il-tahmin" });
    });
  }
}

async function main() {
  const mahalleler = JSON.parse(readFileSync(MAHALLE_JSON, "utf8"));
  process.stderr.write(`[nufus] ${mahalleler.length} mahalle yüklendi\n`);

  const veri = new Map();
  const istatistik = { tuik: 0, osm: 0, "il-tahmin": 0 };

  if (existsSync(TUIK_CSV)) {
    const tuik = csvOku(TUIK_CSV);
    for (const [k, v] of tuik) {
      veri.set(k, v);
      istatistik.tuik++;
    }
    process.stderr.write(`[nufus] TÜİK CSV: ${tuik.size} mahalle\n`);
  } else {
    process.stderr.write(`[nufus] TÜİK CSV yok (${TUIK_CSV}) — OSM + il fallback kullanılacak\n`);
    process.stderr.write(`[nufus] TÜİK indirme: https://nip.tuik.gov.tr/Home/Adnks → CSV olarak kaydet\n`);
  }

  const osmListe = await osmNufusOku();
  process.stderr.write(`[nufus] OSM population: ${osmListe.length} yerleşim\n`);
  const osmMap = osmEslestir(mahalleler, osmListe);
  for (const [k, v] of osmMap) {
    if (!veri.has(k)) {
      veri.set(k, v);
      istatistik.osm++;
    }
  }

  ilFallbackDagit(mahalleler, veri);
  istatistik["il-tahmin"] = [...veri.values()].filter((v) => v.kaynak === "il-tahmin").length;

  const sonuc = {};
  const eslesmeyen = [];
  for (const m of mahalleler) {
    const key = mahalleKey(m.ilNorm, m.ilceNorm, m.mahalleNorm);
    if (!key) continue;
    const row = veri.get(key);
    if (!row) {
      eslesmeyen.push({ key, il: m.il, ilce: m.ilce, mahalle: m.ad });
      continue;
    }
    const tip = tipKodu(m.tip);
    // İl-tahmin sadece şehir mahallelerinde — köylere sahte nüfus yazma
    if (row.kaynak === "il-tahmin" && tip !== 2) continue;
    if (row.toplam >= 100) {
      sonuc[key] = [row.toplam, tip];
    }
  }

  writeFileSync(ESLESMEYEN, JSON.stringify(eslesmeyen.slice(0, 500), null, 2), "utf8");

  const ts = `/**
 * Mahalle nüfus verisi — [toplamNufus, yerlesimTipi].
 * tip: 0=köy/hamlet, 1=belde/kasaba, 2=şehir mahallesi
 *
 * Kaynak: ${existsSync(TUIK_CSV) ? "TÜİK ADNKS CSV + " : ""}OSM population + il düzeyi tahmin
 * Üreten: scripts/nufus-uret.mjs
 * Üretim: ${new Date().toISOString().slice(0, 10)}
 * Kayıt: ${Object.keys(sonuc).length} mahalle
 */
export type MahalleNufusTuple = readonly [toplam: number, tip: 0 | 1 | 2];

export const MAHALLE_NUFUS: Readonly<Record<string, MahalleNufusTuple>> = ${JSON.stringify(sonuc)};

/** Nüfus yoğunluk eşikleri (kişi) */
export const NUFUS_ESIK = {
  kirsal: 500,
  kasaba: 5000,
  sehir: 20000,
} as const;
`;
  writeFileSync(OUT, ts, "utf8");
  process.stderr.write(`[nufus] ✓ ${OUT} — ${Object.keys(sonuc).length} kayıt\n`);
  process.stderr.write(`[nufus] Kaynak: TÜİK=${istatistik.tuik} OSM=${istatistik.osm} il-tahmin=${istatistik["il-tahmin"]}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
