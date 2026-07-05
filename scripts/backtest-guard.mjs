#!/usr/bin/env node
/**
 * Backtest regresyon kilidi (CI) — değerleme motorundaki bir değişiklik doğruluğu
 * bozarsa PR'ı fail eder.
 *
 *   node scripts/backtest-guard.mjs           # eşiklere göre kontrol et (CI)
 *   node scripts/backtest-guard.mjs --yaz     # mevcut metriklerden eşik dosyasını üret
 *
 * Ground-truth: CI'da ignored `data/mahalle-scrape-baseline.json` yok → tracked emlakjet
 * SQL'inden mahalle baseline yeniden inşa edilir (kendi içinde tutarlı, deterministik).
 * Tahmin: ilçe medyanı × özellik çarpanı × ILCE_SKEW (shipped motor davranışı).
 * Eşikler: data/backtest-esik.json (baseline + tolerans).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hazirla, mahalleBaselineFromHam } from "./backtest-baseline.mjs";
import { ozellikCarpani, loadOzellik, DEFAULT_KATSAYILAR } from "./baseline-cekirdek.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ESIK_YOL = join(ROOT, "data/backtest-esik.json");
const SEGMENTLER = ["arsa", "tarla"];
const MIN_TEST = 30;             // bu sayının altında yargılama (gürültü)
const MAPE_TOLERANS = 5.0;       // eşik = baseline MAPE + 5 puan
const WITHIN_TOLERANS = 3.0;     // eşik = baseline within20 − 3 puan
const yaz = process.argv.includes("--yaz");

function metrikler(segment, ozellikMap, mahalleBaseline) {
  const K = DEFAULT_KATSAYILAR;
  const skew = K.ilceSkew?.[segment] ?? 1;
  const { testler } = hazirla(segment, ozellikMap, mahalleBaseline);
  if (testler.length < MIN_TEST) return { n: testler.length, mape: null, within20: null };
  let within = 0, mapeSum = 0;
  for (const t of testler) {
    const tahmin = t.ilceTahmin * ozellikCarpani(t.ozellik, K) * skew;
    const ape = Math.abs(tahmin - t.gercek) / t.gercek;
    mapeSum += ape;
    if (ape <= 0.20) within++;
  }
  const n = testler.length;
  return { n, mape: +(mapeSum / n * 100).toFixed(2), within20: +(within / n * 100).toFixed(1) };
}

function main() {
  const ozellikMap = loadOzellik();
  const mahalleBaseline = mahalleBaselineFromHam(2);

  const guncel = {};
  for (const seg of SEGMENTLER) guncel[seg] = metrikler(seg, ozellikMap, mahalleBaseline);

  // Yeterli veri yoksa (örn. SQL eksik) — CI'ı kırma, uyar ve geç
  const olculebilir = SEGMENTLER.filter((s) => guncel[s].mape != null);
  if (olculebilir.length === 0) {
    console.warn("⚠ Yeterli backtest verisi yok (SQL eksik?). Regresyon kilidi ATLANDI.");
    process.exit(0);
  }

  if (yaz) {
    const esikler = {};
    for (const seg of olculebilir) {
      esikler[seg] = {
        baseline: guncel[seg],
        mape_max: +(guncel[seg].mape + MAPE_TOLERANS).toFixed(2),
        within20_min: +(guncel[seg].within20 - WITHIN_TOLERANS).toFixed(1),
      };
    }
    writeFileSync(ESIK_YOL, JSON.stringify({ olusturuldu: new Date().toISOString(), tolerans: { mape: MAPE_TOLERANS, within20: WITHIN_TOLERANS }, esikler }, null, 2), "utf8");
    console.log("✅ Eşik dosyası yazıldı:", "data/backtest-esik.json");
    for (const seg of olculebilir) console.log(`   ${seg}: MAPE ${guncel[seg].mape} (maks ${esikler[seg].mape_max}) · ±%20 ${guncel[seg].within20} (min ${esikler[seg].within20_min}) · n=${guncel[seg].n}`);
    return;
  }

  if (!existsSync(ESIK_YOL)) {
    console.error("❌ Eşik dosyası yok. Önce: node scripts/backtest-guard.mjs --yaz");
    process.exit(1);
  }
  const { esikler } = JSON.parse(readFileSync(ESIK_YOL, "utf8"));

  let fail = false;
  console.log("Backtest regresyon kilidi:\n");
  for (const seg of olculebilir) {
    const g = guncel[seg], e = esikler[seg];
    if (!e) { console.log(`   ${seg}: eşik tanımsız — atlandı`); continue; }
    const mapeOk = g.mape <= e.mape_max;
    const withinOk = g.within20 >= e.within20_min;
    if (!mapeOk || !withinOk) fail = true;
    console.log(`   ${seg}: MAPE ${g.mape} ${mapeOk ? "≤" : "✗ >"} ${e.mape_max} · ±%20 ${g.within20} ${withinOk ? "≥" : "✗ <"} ${e.within20_min} · n=${g.n}`);
  }

  if (fail) {
    console.error("\n❌ Doğruluk regresyonu — değerleme motoru eşiği aştı. Değişikliği gözden geçir veya kalibre et.");
    process.exit(1);
  }
  console.log("\n✅ Doğruluk eşikleri korunuyor.");
}

main();
