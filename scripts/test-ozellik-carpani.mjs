#!/usr/bin/env node
/**
 * Köy/şehir mahalleleri için yeni özellik çarpanı testi.
 * Beklenti: kıyıdaki köyler premium, sapa köyler iskonto.
 */
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// mahalle-ozellik.ts'i parse et — JSON.stringify çıktısı tek satır
const ts = readFileSync(`${__dirname}/../src/lib/data/mahalle-ozellik.ts`, "utf8");
const dataMatch = ts.match(/MAHALLE_OZELLIK[^=]*=\s*(\{[^\n]*\});/);
if (!dataMatch) { console.error("MAHALLE_OZELLIK parse edilemedi"); process.exit(1); }
const OZELLIK = JSON.parse(dataMatch[1]);

const ESIK = { sahilYakin: 2, metroYakin: 0.5, universiteYakin: 1, anayolYakin: 1, ilMerkezYakin: 15 };

function ozellikCarpani(key) {
  const tuple = OZELLIK[key];
  if (!tuple) return { carpan: 1.0, notlar: ["Özellik verisi yok"] };
  const [sahilKm, metroKm, uniKm, anayolKm, ilMerkezKm] = tuple;
  let carpan = 1.0;
  const notlar = [];

  if (sahilKm > 0 && sahilKm <= 0.5) { carpan *= 1.18; notlar.push(`sahile çok yakın (${(sahilKm*1000).toFixed(0)}m)`); }
  else if (sahilKm > 0 && sahilKm <= ESIK.sahilYakin) { carpan *= 1.10; notlar.push(`sahile yakın (${sahilKm.toFixed(1)}km)`); }
  else if (sahilKm > 0 && sahilKm <= 5) { carpan *= 1.04; notlar.push(`sahil bölge (${sahilKm.toFixed(1)}km)`); }

  if (metroKm > 0 && metroKm <= ESIK.metroYakin) { carpan *= 1.10; notlar.push(`metro yakın (${(metroKm*1000).toFixed(0)}m)`); }
  if (uniKm > 0 && uniKm <= ESIK.universiteYakin) { carpan *= 1.05; notlar.push(`üniv yakın (${uniKm.toFixed(1)}km)`); }
  if (anayolKm > 0 && anayolKm <= ESIK.anayolYakin) { carpan *= 1.08; notlar.push(`anayol yakın (${(anayolKm*1000).toFixed(0)}m)`); }
  else if (anayolKm > 0 && anayolKm <= 3) { carpan *= 1.03; notlar.push(`anayol erişimi (${anayolKm.toFixed(1)}km)`); }

  if (ilMerkezKm > 0 && ilMerkezKm <= ESIK.ilMerkezYakin) { carpan *= 1.12; notlar.push(`il merkez yakın (${ilMerkezKm.toFixed(0)}km)`); }
  else if (ilMerkezKm > 0 && ilMerkezKm <= 30) { carpan *= 1.04; notlar.push(`il merkezi erişilebilir (${ilMerkezKm.toFixed(0)}km)`); }
  else if (ilMerkezKm > 60) { carpan *= 0.92; notlar.push(`il merkezinden uzak (${ilMerkezKm.toFixed(0)}km)`); }

  return { carpan: Math.round(carpan * 1000) / 1000, notlar };
}

console.log("=".repeat(70));
console.log("Köy/Şehir Özellik Çarpanı Karşılaştırma");
console.log("=".repeat(70));
console.log();

const testler = [
  // Şile köyleri (sahil + İstanbul yakın)
  "istanbul__sile__sungurlu",
  "istanbul__sile__kemalli",
  "istanbul__sile__sogullar",
  // Konya iç köyleri
  "konya__karatay__ismil",
  "konya__beysehir__ciftlik",
  "konya__eregli__aziziye",
  // Erzurum sapa köyleri
  "erzurum__uzundere__kardesler",
  "erzurum__olur__kecili",
  // Kıyıdaki köyler
  "mugla__bodrum__yalikavak",
  "antalya__kemer__cirali",
  // Şehir merkezi
  "istanbul__besiktas__bebek",
  "ankara__cankaya__cukurambar",
];

for (const key of testler) {
  const r = ozellikCarpani(key);
  const tuple = OZELLIK[key];
  if (!tuple) { console.log(`${key.padEnd(45)} VERİ YOK`); continue; }
  const [sahil, metro, uni, anayol, ilMerk] = tuple;
  console.log(`${key.padEnd(45)} ×${r.carpan.toFixed(3)}`);
  console.log(`  raw: sahil=${sahil}, metro=${metro}, uni=${uni}, anayol=${anayol}, ilMerk=${ilMerk}`);
  console.log(`  → ${r.notlar.join(" · ")}`);
  console.log();
}
