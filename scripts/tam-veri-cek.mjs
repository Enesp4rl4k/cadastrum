#!/usr/bin/env node
/**
 * Tam veri çekme orkestratörü — arsa + tarla, çoklu kaynak.
 *
 * Kullanım:
 *   node scripts/tam-veri-cek.mjs                    # Emlakjet 81 il (+ secret varsa API scraper'lar)
 *   node scripts/tam-veri-cek.mjs --sadece-emlakjet  # Sadece Emlakjet SQL
 *   node scripts/tam-veri-cek.mjs --atla-emlakjet    # Secret ile Hepsiemlak + Sahibinden
 *   node scripts/tam-veri-cek.mjs --max-sayfa=12     # Emlakjet il başına sayfa
 *
 * Env:
 *   SCRAPER_API_SECRET — Hepsiemlak + Sahibinden için (opsiyonel Emlakjet-only modda)
 *   API_BASE — backend URL
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function parseArgs() {
  const args = process.argv.slice(2);
  const has = (f) => args.includes(f);
  const get = (k) => args.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
  return {
    sadeceEmlakjet: has("--sadece-emlakjet"),
    atlaEmlakjet: has("--atla-emlakjet"),
    maxSayfa: get("max-sayfa"),
    maksIlce: parseInt(get("maks-ilce") ?? "80", 10),
    maksIlan: parseInt(get("maks-ilan") ?? "25", 10),
    headless: get("headless") !== "false",
    onKontrol: !has("--on-kontrol-atla"),
  };
}

function calistir(cmd, cmdArgs, envExtra = {}) {
  return new Promise((resolve, reject) => {
    console.log(`\n▶ ${cmd} ${cmdArgs.join(" ")}\n`);
    const child = spawn(cmd, cmdArgs, {
      cwd: ROOT,
      stdio: "inherit",
      shell: true,
      env: { ...process.env, ...envExtra },
    });
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exit ${code}`))));
    child.on("error", reject);
  });
}

async function main() {
  const ARGS = parseArgs();
  const secret = process.env.SCRAPER_API_SECRET;

  console.log("═══════════════════════════════════════════");
  console.log(" Cadastrum — Tam Veri Çekme");
  console.log("═══════════════════════════════════════════");
  console.log(`SCRAPER_API_SECRET: ${secret ? "✓ set" : "✗ yok (sadece Emlakjet SQL)"}`);
  console.log(`Mod: ${ARGS.sadeceEmlakjet ? "sadece-emlakjet" : ARGS.atlaEmlakjet ? "api-only" : "full"}`);

  if (ARGS.onKontrol) {
    try {
      await calistir("node", ["scripts/canli-veri-on-kontrol.mjs"]);
    } catch {
      console.warn("⚠ Ön kontrol uyarı verdi — devam ediliyor.");
    }
  }

  if (!ARGS.atlaEmlakjet) {
    const emlakEnv = {};
    if (ARGS.maxSayfa) emlakEnv.EMLAKJET_MAX_SAYFA = ARGS.maxSayfa;
    console.log("\n── Faz 1: Emlakjet 81 il × (arsa + tarla) ──");
    console.log("   Çıktı: scripts/emlakjet-data-full.sql");
    console.log("   Tahmini: 4–8 saat\n");
    await calistir("node", ["scripts/emlakjet-scrape-full.mjs"], emlakEnv);
    console.log("\n✓ Emlakjet tamam. D1 yüklemek için: SEED-EMLAKJET-FULL.bat\n");
  }

  if (ARGS.sadeceEmlakjet) {
    console.log("Sadece Emlakjet modu — bitti.");
    return;
  }

  if (!secret) {
    console.error("\nHATA: Hepsiemlak/Sahibinden için SCRAPER_API_SECRET gerekli.");
    console.error("PowerShell: $env:SCRAPER_API_SECRET = '...'");
    console.error("veya SET-SCRAPER-SECRET.bat ile backend secret ayarla, aynı değeri env'e koy.");
    process.exit(1);
  }

  const headlessFlag = ARGS.headless ? [] : ["--headless=false"];

  for (const kategori of ["arsa", "tarla"]) {
    console.log(`\n── Faz 2: Hepsiemlak — ${kategori} ──`);
    await calistir("node", [
      "scripts/aylik-scrape-hepsiemlak.mjs",
      `--maks=${ARGS.maksIlce}`,
      `--maks-ilan=${ARGS.maksIlan}`,
      `--kategori=${kategori}`,
      ...headlessFlag,
    ]);
  }

  for (const kategori of ["arsa", "tarla"]) {
    console.log(`\n── Faz 3: Sahibinden — ${kategori} ──`);
    try {
      await calistir("node", [
        "scripts/aylik-scrape.mjs",
        `--maks=${ARGS.maksIlce}`,
        `--maks-ilan=${ARGS.maksIlan}`,
        `--kategori=${kategori}`,
        ...headlessFlag,
      ]);
    } catch (e) {
      console.warn(`⚠ Sahibinden ${kategori} atlandı veya hata: ${e.message}`);
    }
  }

  console.log("\n═══════════════════════════════════════════");
  console.log(" TAM VERİ ÇEKME BİTTİ");
  console.log(" 1) SEED-EMLAKJET-FULL.bat (SQL varsa)");
  console.log(" 2) D1 COUNT doğrulama (GELISTIRME-PLANI.md)");
  console.log("═══════════════════════════════════════════\n");
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
