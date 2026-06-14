#!/usr/bin/env node
/**
 * Mahalle baseline lookup test — Bandırma Yalı Mh. ve diğer örnekler.
 * Beklenen: AI yokken KNN smoothing → ilçe baseline ile shrink olmuş değer.
 * AI sonrası: gerçek piyasa değerine yakın.
 */
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// TS dosyasını parse etmek yerine direkt JSON'dan oku
const baselineFinal = JSON.parse(
  readFileSync(`${__dirname}/../data/mahalle-baseline-final.json`, "utf8"),
);

function testMahalle(il, ilce, mahalle, beklenenArsa) {
  // normalize
  const norm = s => s.toLocaleLowerCase("tr")
    .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s")
    .replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/\b(mahallesi|mahalle|koyu|koy|beldesi|belde|mah|mh)\b/g, "")
    .replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  const key = `${norm(il)}__${norm(ilce)}__${norm(mahalle)}`;
  const veri = baselineFinal[key];

  console.log(`\n${il} > ${ilce} > ${mahalle}`);
  console.log(`  key: ${key}`);
  if (!veri) {
    console.log("  ❌ BULUNAMADI");
    return;
  }
  for (const seg of ["arsa", "konut", "tarla"]) {
    if (veri[seg]) {
      const v = veri[seg];
      console.log(`  ${seg}: ${v.tlm2.toLocaleString("tr-TR")} TL/m² (güven ${v.guven}, ${v.kaynak})`);
    }
  }
  if (beklenenArsa && veri.arsa) {
    const sapma = ((veri.arsa.tlm2 - beklenenArsa) / beklenenArsa * 100).toFixed(1);
    console.log(`  Beklenen arsa: ${beklenenArsa.toLocaleString("tr-TR")} → sapma %${sapma}`);
  }
}

console.log("=".repeat(60));
console.log("Mahalle Baseline Test (AI YOKKEN, sadece KNN+ilçe-fallback)");
console.log("=".repeat(60));

testMahalle("Balıkesir", "Bandırma", "Yalı", 8400);
testMahalle("Balıkesir", "Bandırma", "Hıdırköy", 5000);
testMahalle("İstanbul", "Kadıköy", "Moda", 50000);
testMahalle("İstanbul", "Beşiktaş", "Bebek", 95000);
testMahalle("İstanbul", "Sarıyer", "Tarabya", 75000);
testMahalle("Muğla", "Bodrum", "Yalıkavak", 70000);
testMahalle("Ankara", "Çankaya", "Çukurambar", 18000);
testMahalle("İzmir", "Konak", "Alsancak", 25000);

// Toplam istatistik
const tum = Object.values(baselineFinal);
let aiSayim = 0, knnSayim = 0, koySayim = 0;
for (const segs of tum) {
  for (const v of Object.values(segs)) {
    if (v.kaynak === "ai-research") aiSayim++;
    else if (v.kaynak === "knn-smoothing") knnSayim++;
    else if (v.kaynak === "ilce-koy-fallback") koySayim++;
  }
}
console.log("\n" + "=".repeat(60));
console.log(`Toplam mahalle: ${tum.length}`);
console.log(`AI: ${aiSayim}, KNN: ${knnSayim}, Köy-fallback: ${koySayim}`);
console.log("Not: AI verisi yokken KNN sadece ilçe baseline'ı homogenize ediyor.");
console.log("Gerçek doğruluk artışı için: GEMINI_API_KEY=xxx node scripts/ai-mahalle-arastir.mjs");
