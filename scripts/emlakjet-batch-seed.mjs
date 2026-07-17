#!/usr/bin/env node
/**
 * Emlakjet Batch Seed — SQL → API chunk upload
 *
 * emlakjet-data-turkiye.sql dosyasındaki ilanları parse edip
 * /v1/ilan/batch-seed endpoint'ine 500'erli chunk'larla gönderir.
 *
 * Kullanım:
 *   SEED_SECRET=xxx API_URL=https://api.cadastrum.com.tr \
 *     node scripts/emlakjet-batch-seed.mjs
 *
 *   # Lokal test:
 *   SEED_SECRET=xxx API_URL=http://localhost:8787 \
 *     node scripts/emlakjet-batch-seed.mjs
 *
 *   # Sadece belirli il:
 *   SEED_SECRET=xxx API_URL=... IL=istanbul \
 *     node scripts/emlakjet-batch-seed.mjs
 *
 * SQL format (sqlYaz çıktısı):
 *   INSERT OR IGNORE INTO ilanlar (...) VALUES
 *   ('emlakjet','ej_12345678','istanbul','kadikoy','fenerbahce',25000,500,'arsa','TL',1749600000,40.97,29.03,'mahalle-merkez',1),
 *   ...;
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// Config
const API_URL = process.env.API_URL ?? "http://localhost:8787";
const SEED_SECRET = process.env.SEED_SECRET;
const IL_FILTRE = process.env.IL?.toLowerCase() ?? null;
const CHUNK_BOYUT = 500;
const DELAY_MS = 300; // chunk'lar arası bekleme (D1 rate limit için)

if (!SEED_SECRET) {
  console.error("❌ SEED_SECRET env değişkeni gerekli");
  console.error("   SEED_SECRET=xxx node scripts/emlakjet-batch-seed.mjs");
  process.exit(1);
}

// SQL dosyasını bul
const SQL_DOSYALAR = [
  join(ROOT, "scripts", "emlakjet-data-turkiye.sql"),
  join(ROOT, "scripts", "emlakjet-data-full.sql"),
  join(ROOT, "scripts", "emlakjet-data.sql"),
];

let sqlDosya = null;
for (const d of SQL_DOSYALAR) {
  if (existsSync(d)) { sqlDosya = d; break; }
}

if (!sqlDosya) {
  console.error("❌ SQL dosyası bulunamadı. Önce scraper'ı çalıştırın:");
  console.error("   node scripts/emlakjet-scrape-turkiye.mjs");
  process.exit(1);
}

console.log(`📂 SQL dosyası: ${sqlDosya}`);
const sql = readFileSync(sqlDosya, "utf8");

// ── SQL Parse ───────────────────────────────────────────────────────────────
// INSERT OR IGNORE INTO ilanlar (kaynak, ilan_no, il_norm, ilce_norm, mahalle_norm,
//   fiyat_per_m2, m2, kategori, para_birimi, yakalanma_tarihi, lat, lng, koord_kaynagi, aktif)
// VALUES ('emlakjet','ej_XXX','il','ilce',mahN,fpm,m2,'kat','TL',ts,lat,lng,'kaynak',1)

const rows = [];
// Her VALUES satırını parse et — tuple regex
const tupleRe = /\('emlakjet','(ej_\d+)','([^']+)','([^']+)',(NULL|'[^']*'),(\d+(?:\.\d+)?),(\d+),'([^']+)','TL',\d+,(NULL|-?\d+(?:\.\d+)?),(NULL|-?\d+(?:\.\d+)?),'[^']*',1\)/g;

for (const m of sql.matchAll(tupleRe)) {
  const [, ilanNo, ilNorm, ilceNorm, mahRaw, fiyatStr, m2Str, kategori, latStr, lngStr] = m;

  // İl filtresi
  if (IL_FILTRE && ilNorm !== IL_FILTRE) continue;

  const mahalle_norm = mahRaw === "NULL" ? null : mahRaw.replace(/^'|'$/g, "");
  const fiyat_per_m2 = parseFloat(fiyatStr);
  const m2 = parseInt(m2Str, 10);
  const lat = latStr === "NULL" ? null : parseFloat(latStr);
  const lng = lngStr === "NULL" ? null : parseFloat(lngStr);

  if (fiyat_per_m2 <= 0 || fiyat_per_m2 > 1_000_000_000) continue;
  if (m2 <= 0 || m2 > 10_000_000) continue;

  rows.push({
    ilan_no: ilanNo,
    il_norm: ilNorm,
    ilce_norm: ilceNorm,
    mahalle_norm,
    fiyat_per_m2,
    m2,
    kategori,
    lat,
    lng,
  });
}

if (rows.length === 0) {
  console.error("❌ Parse edilecek satır bulunamadı. SQL formatını kontrol edin.");
  process.exit(1);
}

console.log(`✅ ${rows.length} satır parse edildi${IL_FILTRE ? ` (il=${IL_FILTRE})` : ""}`);

// ── Chunk'la gönder ─────────────────────────────────────────────────────────
const toplam_chunk = Math.ceil(rows.length / CHUNK_BOYUT);
let toplam_inserted = 0;
let toplam_skipped = 0;
let toplam_hatali = 0;
let basarili_chunk = 0;

const uyku = (ms) => new Promise((r) => setTimeout(r, ms));

console.log(`\n🚀 ${toplam_chunk} chunk × ${CHUNK_BOYUT} satır → ${API_URL}/v1/ilan/batch-seed\n`);

for (let i = 0; i < rows.length; i += CHUNK_BOYUT) {
  const chunk = rows.slice(i, i + CHUNK_BOYUT);
  const chunkNo = Math.floor(i / CHUNK_BOYUT) + 1;

  process.stdout.write(`[${chunkNo}/${toplam_chunk}] ${chunk.length} satır gönderiliyor... `);

  try {
    const res = await fetch(`${API_URL}/v1/ilan/batch-seed`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SEED_SECRET}`,
      },
      body: JSON.stringify({ rows: chunk }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "?");
      console.error(`❌ HTTP ${res.status}: ${err.slice(0, 200)}`);
      continue;
    }

    const data = await res.json();
    toplam_inserted += data.inserted ?? 0;
    toplam_skipped += data.skipped ?? 0;
    toplam_hatali += data.hatali ?? 0;
    basarili_chunk++;
    console.log(`✓ insert=${data.inserted} skip=${data.skipped} hata=${data.hatali}`);
  } catch (e) {
    console.error(`❌ İstek hatası: ${e.message}`);
  }

  if (i + CHUNK_BOYUT < rows.length) await uyku(DELAY_MS);
}

console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Tamamlandı
   Toplam satır   : ${rows.length}
   Insert edilen  : ${toplam_inserted}
   Zaten vardı    : ${toplam_skipped}
   Hatalı         : ${toplam_hatali}
   Chunk başarı   : ${basarili_chunk}/${toplam_chunk}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Sonraki adım — istatistikleri güncelle:
  curl -X GET "${API_URL}/v1/istatistik/refresh?secret=STATS_SECRET"
`);
