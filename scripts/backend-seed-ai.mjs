#!/usr/bin/env node
/**
 * data/mahalle-baseline-final.json (AI + KNN sonuçları) → Backend D1.
 *
 * Endpoint: POST /v1/ilan/batch (Bearer auth)
 * Hedef tablo: mahalle_baseline_ai (extension'ın yerel mahalle-baseline'ının
 * sunucu kopyası — extension lokalde yoksa API'ye sorar).
 *
 * Çalıştırma:
 *   SCRAPER_SECRET=xxx node scripts/backend-seed-ai.mjs
 */
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASELINE_FILE = `${__dirname}/../data/mahalle-baseline-final.json`;
const API_BASE = process.env.API_BASE ?? "https://cadastrum-api.dumencibaba1910.workers.dev/v1";
const SECRET = process.env.SCRAPER_SECRET;

if (!SECRET) {
  console.error("SCRAPER_SECRET environment variable gerekli.");
  console.error("Usage: SCRAPER_SECRET=xxx node scripts/backend-seed-ai.mjs");
  process.exit(1);
}

async function main() {
  const data = JSON.parse(readFileSync(BASELINE_FILE, "utf8"));
  const keys = Object.keys(data);
  console.error(`[seed] ${keys.length} mahalle, AI seed olarak yükleniyor...`);

  // Her mahalle × segment → backend'e endpoint yok, custom endpoint açalım veya direkt SQL.
  // Şu an batch ilan API'si var ama o "ilanlar" tablosu için.
  // mahalle_baseline_ai için yeni endpoint açalım: POST /v1/baseline/seed
  // Şimdilik direkt API'a ham SQL göndermek için cron secret'i kullan.

  // Pragmatic: mahalle_baseline_ai INSERT için yeni endpoint gerek.
  // Şimdilik bu script sadece data hazırlığı yapsın, JSON'u yazıp kullanıcıya yöntem göster.

  const seedRows = [];
  for (const [key, segs] of Object.entries(data)) {
    const [il_norm, ilce_norm, mahalle_norm] = key.split("__");
    if (!mahalle_norm) continue;
    for (const [kategori, v] of Object.entries(segs)) {
      if (!v || v.tlm2 <= 0) continue;
      seedRows.push({
        il_norm, ilce_norm, mahalle_norm,
        kategori,
        tlm2: v.tlm2,
        guven: v.guven ?? 30,
        kaynak: v.kaynak ?? "knn-smoothing",
        yakalandi: Date.now(),
      });
    }
  }
  console.error(`[seed] ${seedRows.length} satır hazırlandı`);

  // Batched POST — 100 satır/istek
  const BATCH = 100;
  let basarili = 0, hata = 0;
  for (let i = 0; i < seedRows.length; i += BATCH) {
    const batch = seedRows.slice(i, i + BATCH);
    try {
      const res = await fetch(`${API_BASE}/baseline/seed`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SECRET}`,
        },
        body: JSON.stringify({ rows: batch }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        const txt = await res.text();
        console.error(`  Batch ${i}: HTTP ${res.status} - ${txt.slice(0, 200)}`);
        hata += batch.length;
      } else {
        const r = await res.json();
        basarili += r.inserted ?? batch.length;
        if ((i / BATCH) % 20 === 0) {
          console.error(`[seed] ${i + batch.length}/${seedRows.length}...`);
        }
      }
    } catch (e) {
      console.error(`  Batch ${i}: ${e.message}`);
      hata += batch.length;
    }
  }

  console.error(`[seed] ✓ Tamamlandı: ${basarili} başarılı, ${hata} hata`);
}

main().catch(e => { console.error(e); process.exit(1); });
