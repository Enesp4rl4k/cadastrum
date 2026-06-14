#!/usr/bin/env node
/**
 * Türkiye 973 ilçe × (arsa + tarla) — mahalle breadcrumb ile gerçek fiyat.
 *
 *   node scripts/emlakjet-scrape-turkiye.mjs
 *   node scripts/emlakjet-scrape-turkiye.mjs --il=istanbul
 *   node scripts/emlakjet-scrape-turkiye.mjs --basla=200 --maks-ilce=50
 *
 * Resume: data/emlakjet-scrape-progress.json
 * Çıktı:  scripts/emlakjet-data-turkiye.sql
 */
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import {
  objeyiCikar,
  ilceListesiYukle,
  sqlYaz,
  sqlIdleriYukle,
  sqlKayitlariYukle,
  progressYukle,
  progressKaydet,
  ilceTara,
} from "./emlakjet-lib.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CIKTI = join(ROOT, "scripts", "emlakjet-data-turkiye.sql");
const PROGRESS = join(ROOT, "data", "emlakjet-scrape-progress.json");
const FULL_SQL = join(ROOT, "scripts", "emlakjet-data-full.sql");

const args = process.argv.slice(2);
const get = (k) => args.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const filtreIl = get("il");
const basla = parseInt(get("basla") ?? "0", 10);
const maksIlce = get("maks-ilce") ? parseInt(get("maks-ilce"), 10) : null;
const MAX_SAYFA = parseInt(process.env.EMLAKJET_ILCE_MAX_SAYFA ?? get("max-sayfa") ?? "4", 10);

console.log("Mahalle merkezleri yükleniyor...");
const MERKEZ = objeyiCikar(join(ROOT, "src/lib/data/mahalle-merkezleri.ts"), "MERKEZ_TUPLES");
console.log(`  ${Object.keys(MERKEZ).length} merkez`);

let ilceler = ilceListesiYukle(join(ROOT, "data/mahalleler.json"));
console.log(`  ${ilceler.length} ilçe (973 hedef)`);
if (filtreIl) {
  ilceler = ilceler.filter((x) => x.ilNorm === filtreIl);
  console.log(`  Filtre il=${filtreIl} → ${ilceler.length} ilçe`);
}
if (basla > 0) ilceler = ilceler.slice(basla);
if (maksIlce) ilceler = ilceler.slice(0, maksIlce);

const progress = progressYukle(PROGRESS);
const completedSet = new Set(progress.completed ?? []);
const kayitlar = sqlKayitlariYukle(CIKTI, FULL_SQL);
const gorulenler = new Set(kayitlar.map((k) => k.id));
for (const id of sqlIdleriYukle(CIKTI, FULL_SQL)) gorulenler.add(id);
console.log(
  `  Resume: ${gorulenler.size} ilan id, ${kayitlar.length} kayıt bellekte, ${completedSet.size} tamamlanmış ilçe/kategori`,
);

const toplamIs = ilceler.length * 2;
let is = 0;

for (const { ilNorm, ilceNorm, il, ilce } of ilceler) {
  for (const kat of ["arsa", "tarla"]) {
    is++;
    const key = `${ilNorm}__${ilceNorm}__${kat}`;
    if (completedSet.has(key)) {
      if (is % 50 === 0) console.log(`[${is}/${toplamIs}] skip ${key}`);
      continue;
    }
    process.stdout.write(`[${is}/${toplamIs}] ${il}/${ilce}/${kat} `);
    const n = await ilceTara(ilNorm, ilceNorm, kat, MAX_SAYFA, kayitlar, gorulenler, MERKEZ, {
      delayMs: 500,
    });
    const koordlu = kayitlar.filter((k) => k.lat).length;
    console.log(`+${n} (toplam ${kayitlar.length}, koordlu ${koordlu}, mahalle ${new Set(kayitlar.filter((k) => k.mahN).map((k) => `${k.ilN}__${k.ilceN}__${k.mahN}`)).size})`);

    completedSet.add(key);
    progress.completed = [...completedSet];
    progress.stats = {
      toplamIlan: kayitlar.length,
      koordlu,
      uniqueMahalle: new Set(
        kayitlar.filter((k) => k.mahN).map((k) => `${k.ilN}__${k.ilceN}__${k.mahN}`),
      ).size,
      sonGuncelleme: new Date().toISOString(),
    };
    progressKaydet(PROGRESS, progress);
    sqlYaz(kayitlar, CIKTI, "Emlakjet 973 ilçe");
  }
}

sqlYaz(kayitlar, CIKTI, "Emlakjet 973 ilçe — FINAL");
console.log(`\n✅ ${kayitlar.length} ilan → ${CIKTI}`);
console.log(`   ${progress.stats?.uniqueMahalle ?? "?"} mahalle eşleşmeli`);
console.log(`   D1: SEED-EMLAKJET-TURKIYE.bat`);
