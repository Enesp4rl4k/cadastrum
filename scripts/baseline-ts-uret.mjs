#!/usr/bin/env node
/**
 * data/mahalle-baseline-final.json → src/lib/data/mahalle-baseline.ts
 * data/mahalleler.json → src/lib/data/mahalle-centroid.ts
 *
 * Compact tuple format kullanır:
 *   [arsaTlm2, arsaGuven, konutTlm2, konutGuven, tarlaTlm2, tarlaGuven]
 *   null değer → 0
 *
 * Bu sayede 3.5MB JSON → 1.5MB TS → 250KB gzip.
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASELINE_JSON = `${__dirname}/../data/mahalle-baseline-final.json`;
const MAHALLE_JSON = `${__dirname}/../data/mahalleler.json`;
const BASELINE_TS = `${__dirname}/../src/lib/data/mahalle-baseline.ts`;
const CENTROID_TS = `${__dirname}/../data/mahalle-centroid.json`;

function main() {
  // Baseline
  const baseline = JSON.parse(readFileSync(BASELINE_JSON, "utf8"));
  const mahalleListesi = JSON.parse(readFileSync(MAHALLE_JSON, "utf8"));

  // Centroid sadece script-only (extension bundle'a girmez).
  const centroidMap = {};
  for (const m of mahalleListesi) {
    if (!m.ilNorm || !m.ilceNorm || !m.mahalleNorm) continue;
    const mKey = `${m.ilNorm}__${m.ilceNorm}__${m.mahalleNorm}`;
    centroidMap[mKey] = [+m.lat.toFixed(5), +m.lng.toFixed(5)];
  }

  // AI şablon fiyatları (Gemini batch halüsinasyonu) — scraping önceliği için atla
  const AI_SABLON_ARSA = new Set([8500, 9500, 8000, 2500]);
  const AI_SABLON_KONUT = new Set([12000, 3500, 57000]);
  const AI_SABLON_TARLA = new Set([1500, 1200, 500, 2000, 2500]);

  function aiSablonMu(segs) {
    if (segs.arsa?.kaynak === "ai-research") return true;
    if (segs.arsa?.kaynak !== "kirsal-arsa-baseline" && segs.arsa?.kaynak !== "knn-smoothing") return false;
    const a = segs.arsa?.tlm2, k = segs.konut?.tlm2, t = segs.tarla?.tlm2;
    if (a && AI_SABLON_ARSA.has(a) && k && AI_SABLON_KONUT.has(k) && (!t || AI_SABLON_TARLA.has(t))) return true;
    return false;
  }

  // Baseline tuple format: [arsaTlm2, arsaGuven, konutTlm2, konutGuven, tarlaTlm2, tarlaGuven]
  const tuples = {};
  let atlananAi = 0, atlananSablon = 0;
  for (const [key, segs] of Object.entries(baseline)) {
    if (segs.arsa?.kaynak === "ai-research") { atlananAi++; continue; }
    if (aiSablonMu(segs)) { atlananSablon++; continue; }
    // emlakjet-scrape ve knn — dahil

    const tup = [
      segs.arsa?.tlm2 ?? 0,
      segs.arsa?.guven ?? 0,
      segs.konut?.tlm2 ?? 0,
      segs.konut?.guven ?? 0,
      segs.tarla?.tlm2 ?? 0,
      segs.tarla?.guven ?? 0,
    ];
    if (tup.every(x => x === 0)) continue;
    tuples[key] = tup;
  }

  const kaynakStats = { scrape: 0, knnArsa: 0, koyArsa: 0, kirsalArsa: 0 };
  for (const segs of Object.values(baseline)) {
    if (segs.arsa?.kaynak === "ai-research") continue;
    if (segs.arsa?.kaynak === "emlakjet-scrape") kaynakStats.scrape++;
    else if (segs.arsa?.kaynak === "knn-smoothing") kaynakStats.knnArsa++;
    else if (segs.arsa?.kaynak === "ilce-koy-fallback") kaynakStats.koyArsa++;
    else if (segs.arsa?.kaynak === "kirsal-arsa-baseline") kaynakStats.kirsalArsa++;
  }
  console.error(`[ts-uret] Atlanan: ai-research=${atlananAi}, sablon=${atlananSablon}`);

  // mahalle-baseline.ts üret
  const baselineTs = `/**
 * Mahalle bazlı baseline TL/m² fiyatları.
 * Üretildi: ${new Date().toISOString().slice(0, 10)}
 *
 * Format: [arsaTlm2, arsaGuven, konutTlm2, konutGuven, tarlaTlm2, tarlaGuven]
 * 0 değer → o segment için veri yok.
 *
 * Kaynak: SCRAPING ÖNCELİKLİ — AI baseline dahil DEĞİL (KNN + kırsal + ilçe fallback)
 *
 * Toplam ${Object.keys(tuples).length} mahalle.
 * Scrape-arsa: ${kaynakStats.scrape}, KNN: ${kaynakStats.knnArsa}, Kırsal: ${kaynakStats.kirsalArsa}
 *
 * Kullanım: src/lib/baseline-engine.ts
 */
export type MahalleBaselineTuple = readonly [
  arsaTlm2: number,
  arsaGuven: number,
  konutTlm2: number,
  konutGuven: number,
  tarlaTlm2: number,
  tarlaGuven: number,
];

/** Anahtar formatı: "${"il_norm"}__${"ilce_norm"}__${"mahalle_norm"}" — normalizeYerAdi ile uyumlu. */
export const MAHALLE_BASELINE: Readonly<Record<string, MahalleBaselineTuple>> = ${JSON.stringify(tuples)};

/** Mahalle key'inden ilçe key'i (Bayesian shrinkage için): ilk 2 segment.
 *  "balikesir__bandirma__yali" → "balikesir__bandirma" */
export function ilceKeyFromMahalle(mahalleKey: string): string {
  const i = mahalleKey.indexOf("__");
  const j = mahalleKey.indexOf("__", i + 2);
  return j > 0 ? mahalleKey.slice(0, j) : mahalleKey;
}

/** Üretim tarihi — enflasyon düzeltmesi için BASELINE_TARIH gibi kullanılır. */
export const MAHALLE_BASELINE_TARIH = "${new Date().toISOString().slice(0, 7)}";
`;

  writeFileSync(BASELINE_TS, baselineTs, "utf8");
  process.stderr.write(`[ts-uret] ✓ ${BASELINE_TS} (${(baselineTs.length / 1024 / 1024).toFixed(2)} MB)\n`);

  // Centroid sadece script-only (build pipeline için), extension bundle'a girmez
  writeFileSync(CENTROID_TS, JSON.stringify(centroidMap), "utf8");
  process.stderr.write(`[ts-uret] ✓ ${CENTROID_TS} (${(JSON.stringify(centroidMap).length / 1024 / 1024).toFixed(2)} MB, script-only)\n`);
}

main();
