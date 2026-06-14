#!/usr/bin/env node
/**
 * D1 Backup Script — cadastrum-db'yi `.sql` dump olarak yedekler.
 *
 * Kullanım:
 *   node scripts/d1-backup.mjs
 *   node scripts/d1-backup.mjs --dir=C:/backup
 *
 * Çıktı: `backup-cadastrum-YYYYMMDD-HHmm.sql` zaman damgalı dosya.
 *
 * Notlar:
 * - `wrangler d1 export` komutunu kullanır; wrangler login olmuş olmalı
 * - Cloudflare R2 bucket'a otomatik yükleme YAPMAZ — manuel veya cron ile
 *   `wrangler r2 object put` ile yükleyebilirsin
 * - Pilot/production'ı korumak için haftada en az 1 kez çalıştır
 *
 * Cron önerisi (Windows Task Scheduler veya CI):
 *   wrangler d1 export cadastrum-db --remote --output=backup-{ts}.sql
 *   wrangler r2 object put backups/d1/backup-{ts}.sql --file=backup-{ts}.sql
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");
const BACKEND_DIR = resolve(PROJECT_ROOT, "backend/api");

function args() {
  const dir = process.argv.find((a) => a.startsWith("--dir="))?.split("=")[1];
  return {
    outputDir: dir ? resolve(dir) : resolve(PROJECT_ROOT, "backup"),
  };
}

function timestamp() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const HH = String(d.getHours()).padStart(2, "0");
  const MM = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${HH}${MM}`;
}

function main() {
  const { outputDir } = args();
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const out = resolve(outputDir, `backup-cadastrum-${timestamp()}.sql`);
  console.log(`[d1-backup] Hedef: ${out}`);

  try {
    execSync(
      `npx wrangler d1 export cadastrum-db --remote --output="${out}"`,
      { cwd: BACKEND_DIR, stdio: "inherit" },
    );
    console.log(`[d1-backup] ✓ Tamamlandı: ${out}`);
  } catch (e) {
    console.error("[d1-backup] HATA:", e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}

main();
