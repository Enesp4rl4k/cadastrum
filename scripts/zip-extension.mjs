#!/usr/bin/env node
/**
 * dist/ klasörünü Chrome Web Store yükleme zip'ine paketler.
 * Kullanım: npm run build:store && npm run zip:store
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const version = pkg.version;
const distDir = path.join(root, "dist");
const outDir = path.join(root, "chrome-store");
const outZip = path.join(outDir, `cadastrum-v${version}-store.zip`);

if (!existsSync(path.join(distDir, "manifest.json"))) {
  console.error("dist/manifest.json bulunamadı — önce npm run build:store çalıştırın.");
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
if (existsSync(outZip)) rmSync(outZip);

const distEsc = distDir.replace(/'/g, "''");
const zipEsc = outZip.replace(/'/g, "''");

execSync(
  `powershell -NoProfile -Command "Set-Location -LiteralPath '${distEsc}'; Compress-Archive -Path '*' -DestinationPath '${zipEsc}' -Force"`,
  { stdio: "inherit" },
);

console.log(`\n✓ Store zip hazır: ${outZip}`);
