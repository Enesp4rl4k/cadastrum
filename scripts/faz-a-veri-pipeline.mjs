#!/usr/bin/env node
/**
 * Faz A veri pipeline — statik dataset üretimi + canlı ilan scrape yönlendirmesi.
 *
 * Statik (bu script):
 *   node scripts/faz-a-veri-pipeline.mjs --statik
 *
 * Canlı ilan (ayrı, saatler sürebilir):
 *   node scripts/faz-a-veri-pipeline.mjs --ilan
 *   veya: node scripts/turkiye-tam-veri.mjs
 *
 * Hepsi:
 *   node scripts/faz-a-veri-pipeline.mjs --tum
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const statik = args.has("--statik") || args.has("--tum") || args.size === 0;
const ilan = args.has("--ilan") || args.has("--tum");

function calistir(script, extra = []) {
  return new Promise((resolve, reject) => {
    console.log(`\n▶ node scripts/${script} ${extra.join(" ")}\n`);
    const child = spawn("node", [join(ROOT, "scripts", script), ...extra], {
      cwd: ROOT,
      stdio: "inherit",
    });
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${script} exit ${code}`))));
  });
}

async function main() {
  console.log("═══════════════════════════════════════");
  console.log(" Cadastrum Faz A — Veri Pipeline");
  console.log("═══════════════════════════════════════\n");

  if (statik) {
    console.log("── Statik dataset üretimi ──\n");
    await calistir("osb-uret.mjs");
    await calistir("nufus-uret.mjs");
    await calistir("taskin-proxy-uret.mjs");
    console.log("\n✓ Statik dataset'ler güncellendi.");
    console.log("  Extension build: npm run build\n");
  }

  if (ilan) {
    if (!process.env.SCRAPER_API_SECRET) {
      console.warn("⚠ SCRAPER_API_SECRET yok — Hepsiemlak batch atlanabilir.");
    }
    console.log("── Canlı ilan verisi (uzun sürebilir) ──\n");
    await calistir("emlakjet-scrape-full.mjs").catch((e) => {
      console.warn("Emlakjet scrape hata:", e.message);
    });
    if (process.env.SCRAPER_API_SECRET) {
      await calistir("aylik-scrape-hepsiemlak.mjs", ["--maks=80"]).catch((e) => {
        console.warn("Hepsiemlak scrape hata:", e.message);
      });
    }
    await calistir("veri-kalite-kontrol.mjs").catch(() => {});
    console.log("\n✓ İlan scrape tamamlandı (veya kısmen).");
    console.log("  D1 yükle: SEED-EMLAKJET-FULL.bat veya SEED-EMLAKJET-TURKIYE.bat\n");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
