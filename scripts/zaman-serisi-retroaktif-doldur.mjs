#!/usr/bin/env node
/**
 * Cadastrum — Zaman Serisi Retroaktif Doldurma Scripti
 *
 * Geçmiş aylardaki ilanları (yakalanma_tarihi) gruplayarak
 * mahalle_zaman_serisi tablosunu doldurur.
 *
 * Kullanım:
 *   node scripts/zaman-serisi-retroaktif-doldur.mjs --admin-token=<JWT>
 *   node scripts/zaman-serisi-retroaktif-doldur.mjs --remote
 *   node scripts/zaman-serisi-retroaktif-doldur.mjs --local
 */

import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const BACKEND_DIR = resolve(ROOT, "backend/api");

const args = process.argv.slice(2);
const tokenArg = args.find((a) => a.startsWith("--admin-token="))?.split("=")[1] || process.env.ADMIN_TOKEN;
const isRemote = args.includes("--remote");
const isLocal = args.includes("--local");
const apiBase = process.env.API_BASE || "https://cadastrum-api.cadastrum-tr.workers.dev/v1";

console.log("==================================================");
console.log("   CADASTRUM RETROAKTİF ZAMAN SERİSİ DOLDURMA     ");
console.log("==================================================");

async function main() {
  if (tokenArg) {
    console.log(`📡 Backend Admin API üzerinden tetikleniyor (${apiBase}/admin/zaman-serisi-retroaktif)...`);
    try {
      const res = await fetch(`${apiBase}/admin/zaman-serisi-retroaktif`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenArg}`,
        },
      });

      if (!res.ok) {
        const text = await res.text();
        console.error(`❌ İstek başarısız (${res.status}):`, text);
        process.exit(1);
      }

      const data = await res.json();
      console.log("✅ Başarılı:", JSON.stringify(data, null, 2));
      return;
    } catch (e) {
      console.error("❌ Ağ hatası:", e.message);
      process.exit(1);
    }
  }

  // Wrangler D1 doğrudan SQL çalıştır
  const flag = isRemote ? "--remote" : "--local";
  console.log(`⚙️ Wrangler D1 ile SQL seviyesinde zaman serisi dolduruluyor (${flag})...`);

  // SQLite aggregation SQL — ilanlar tablosundan doğrudan mahalle_zaman_serisi'ne aktar
  const sql = `
    INSERT INTO mahalle_zaman_serisi (il_norm, ilce_norm, mahalle_norm, kategori, yil, ay, medyan, ilan_adet)
    SELECT 
      il_norm,
      ilce_norm,
      mahalle_norm,
      kategori,
      CAST(strftime('%Y', datetime(yakalanma_tarihi / 1000, 'unixepoch')) AS INTEGER) as yil,
      CAST(strftime('%m', datetime(yakalanma_tarihi / 1000, 'unixepoch')) AS INTEGER) as ay,
      ROUND(AVG(fiyat_per_m2), 2) as medyan,
      COUNT(*) as ilan_adet
    FROM ilanlar
    WHERE aktif = 1 
      AND mahalle_norm IS NOT NULL 
      AND fiyat_per_m2 > 0 
      AND yakalanma_tarihi > 0
    GROUP BY il_norm, ilce_norm, mahalle_norm, kategori, yil, ay
    ON CONFLICT(il_norm, ilce_norm, mahalle_norm, kategori, yil, ay) DO UPDATE SET
      medyan = excluded.medyan,
      ilan_adet = excluded.ilan_adet;
  `.replace(/\s+/g, " ").trim();

  try {
    const cmd = `npx wrangler d1 execute cadastrum-db ${flag} --command="${sql.replace(/"/g, '\\"')}"`;
    console.log(`[wrangler] Komut çalıştırılıyor...`);
    execSync(cmd, { cwd: BACKEND_DIR, stdio: "inherit" });
    console.log("✅ D1 zaman serisi retroaktif doldurma tamamlandı.");
  } catch (err) {
    console.warn("⚠ Wrangler komutu çalıştırılamadı (Wrangler auth / ortam gerekebilir):", err.message);
    console.log("\n💡 İpucu: Bu işlemi canlıda çalıştırmak için:");
    console.log("  node scripts/zaman-serisi-retroaktif-doldur.mjs --admin-token=<JWT>");
  }
}

main();
