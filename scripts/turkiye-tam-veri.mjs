#!/usr/bin/env node
/**
 * Türkiye tam veri pipeline — AI yok.
 *  1) 81 il geniş tarama (kalan iller)
 *  2) 973 ilçe derin tarama (mahalle breadcrumb)
 *  3) Kalite kontrol
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function calistir(script, extraArgs = []) {
  return new Promise((resolve, reject) => {
    console.log(`\n▶ node scripts/${script} ${extraArgs.join(" ")}\n`);
    const child = spawn("node", [join(ROOT, "scripts", script), ...extraArgs], {
      cwd: ROOT,
      stdio: "inherit",
      shell: true,
    });
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${script} exit ${code}`))));
  });
}

async function main() {
  console.log("══════════════════════════════════════════");
  console.log(" Türkiye Tam Veri — 81 il + 973 ilçe");
  console.log("══════════════════════════════════════════\n");

  if (!process.argv.includes("--atla-81il")) {
    console.log("── Faz 1: 81 il (arsa+tarla, geniş) ──");
    await calistir("emlakjet-scrape-full.mjs");
  }

  if (!process.argv.includes("--atla-ilce")) {
    console.log("\n── Faz 2: 973 ilçe (mahalle detay) ──");
    console.log("   Tahmini: birkaç gün — checkpoint her ilçe\n");
    await calistir("emlakjet-scrape-turkiye.mjs");
  }

  console.log("\n── Faz 3: Kalite kontrol ──");
  await calistir("veri-kalite-kontrol.mjs", [
    "--dosya=scripts/emlakjet-data-turkiye.sql",
  ]).catch(() => calistir("veri-kalite-kontrol.mjs"));

  console.log("\n══════════════════════════════════════════");
  console.log(" Bitti. D1 yükle: SEED-EMLAKJET-TURKIYE.bat");
  console.log("══════════════════════════════════════════\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
