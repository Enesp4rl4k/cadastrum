#!/usr/bin/env node
/**
 * Baseline doğrulama + karşılaştırma raporu.
 *
 * AI tarama 2. iterasyon sonrası mevcut sistemin değişimini göster.
 * - Önce/sonra fiyat farkı
 * - Mahalle başına yeni özellik çarpanı etkisi
 * - Outlier tespit (AI tahmin gerçeklikten çok mu uzak)
 *
 * Çıktı: data/baseline-rapor.json + console rapor
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// 1. Eski snapshot oku (yedek alındıysa) veya AI dosyasından
const aiArastirma = JSON.parse(readFileSync(`${__dirname}/../data/mahalle-ai-arastirma.json`, "utf8"));
const aiKeys = Object.keys(aiArastirma);
console.log(`[karsilastir] AI taranan mahalle: ${aiKeys.length}`);

// 2. Mevcut baseline (KNN+kırsal+AI birleşik)
const baseline = JSON.parse(readFileSync(`${__dirname}/../data/mahalle-baseline-final.json`, "utf8"));
console.log(`[karsilastir] Toplam baseline: ${Object.keys(baseline).length}`);

// 3. Özellik vector
const ozellikTs = readFileSync(`${__dirname}/../src/lib/data/mahalle-ozellik.ts`, "utf8");
const ozellikMatch = ozellikTs.match(/MAHALLE_OZELLIK[^=]*=\s*(\{[^\n]*\});/);
const OZELLIK = ozellikMatch ? JSON.parse(ozellikMatch[1]) : {};
console.log(`[karsilastir] Özellik vector: ${Object.keys(OZELLIK).length} mahalle`);

// 4. Karşılaştırma — AI vs KNN-only sapma
const sapmalar = [];
let aiBuyuk = 0, aiKucuk = 0, aiUyumlu = 0;

for (const key of aiKeys) {
  const ai = aiArastirma[key];
  const base = baseline[key];
  if (!ai?.arsa?.tlm2 || !base?.arsa?.tlm2) continue;

  const aiFiyat = ai.arsa.tlm2;
  const baseFiyat = base.arsa.tlm2;
  const sapma = ((aiFiyat - baseFiyat) / baseFiyat) * 100;

  sapmalar.push({
    key,
    ai: aiFiyat,
    base: baseFiyat,
    sapma: Math.round(sapma * 10) / 10,
    kaynak: base.arsa.kaynak,
  });

  if (sapma > 30) aiBuyuk++;
  else if (sapma < -30) aiKucuk++;
  else aiUyumlu++;
}

// 5. İstatistikler
console.log("\n=== AI vs Mevcut Baseline Karşılaştırma ===");
console.log(`Uyumlu (±%30): ${aiUyumlu}`);
console.log(`AI çok yüksek (>+%30): ${aiBuyuk}`);
console.log(`AI çok düşük (<-%30): ${aiKucuk}`);

// 6. Top sapan mahalleler — manuel review için
sapmalar.sort((a, b) => Math.abs(b.sapma) - Math.abs(a.sapma));
console.log("\n=== Top 15 sapma — Manuel review ===");
for (const s of sapmalar.slice(0, 15)) {
  const yon = s.sapma > 0 ? "↑" : "↓";
  console.log(`${s.key.padEnd(45)} ${yon} %${Math.abs(s.sapma).toFixed(1)} | AI:${s.ai.toLocaleString("tr-TR")} vs Baseline:${s.base.toLocaleString("tr-TR")} (${s.kaynak})`);
}

// 7. Özellik çarpanı dağılımı (yeni baseline final için)
console.log("\n=== Özellik çarpanı dağılımı (AI taranan mahallelerde) ===");
let ozellikSayim = { yuksek: 0, normal: 0, dusuk: 0 };
for (const s of sapmalar) {
  const tuple = OZELLIK[s.key];
  if (!tuple) continue;
  const [sahil, , , anayol, ilMerk] = tuple;
  let carpan = 1.0;
  if (sahil > 0 && sahil <= 0.5) carpan *= 1.18;
  else if (sahil > 0 && sahil <= 2) carpan *= 1.10;
  if (anayol > 0 && anayol <= 1) carpan *= 1.08;
  if (ilMerk > 0 && ilMerk <= 15) carpan *= 1.12;
  else if (ilMerk > 60) carpan *= 0.92;

  if (carpan > 1.10) ozellikSayim.yuksek++;
  else if (carpan < 0.95) ozellikSayim.dusuk++;
  else ozellikSayim.normal++;
}
console.log(`Yüksek özellik prim (>×1.10): ${ozellikSayim.yuksek}`);
console.log(`Normal: ${ozellikSayim.normal}`);
console.log(`İskonto (<×0.95): ${ozellikSayim.dusuk}`);

// 8. JSON rapor
const rapor = {
  olusturuldu: new Date().toISOString(),
  aiToplam: aiKeys.length,
  baselineToplam: Object.keys(baseline).length,
  ozellikToplam: Object.keys(OZELLIK).length,
  uyumluSayim: { uyumlu: aiUyumlu, aiBuyuk, aiKucuk },
  ozellikSayim,
  topSapmalar: sapmalar.slice(0, 50),
};

writeFileSync(`${__dirname}/../data/baseline-rapor.json`, JSON.stringify(rapor, null, 2));
console.log(`\n✓ Rapor: data/baseline-rapor.json`);
