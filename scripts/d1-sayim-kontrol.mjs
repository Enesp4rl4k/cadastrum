#!/usr/bin/env node
/**
 * D1 arsa+tarla ilan sayım doğrulaması.
 *
 * Kullanım:
 *   set STATS_SECRET=<secret> && node scripts/d1-sayim-kontrol.mjs
 *   STATS_SECRET=<secret> node scripts/d1-sayim-kontrol.mjs
 *   node scripts/d1-sayim-kontrol.mjs --api=https://cadastrum-api.workers.dev/v1
 *
 * Hedef: arsa+tarla aktif ilan >= 50.000
 */

const API_BASE =
  process.argv.find((a) => a.startsWith("--api="))?.split("=")[1] ||
  process.env.API_BASE ||
  "https://api.cadastrum.com.tr/v1";

const STATS_SECRET = process.env.STATS_SECRET;

const HATA  = "\x1b[31m✗\x1b[0m";
const OK    = "\x1b[32m✓\x1b[0m";
const WARN  = "\x1b[33m⚠\x1b[0m";
const INFO  = "\x1b[36mi\x1b[0m";
const BOLD  = "\x1b[1m";
const RESET = "\x1b[0m";

if (!STATS_SECRET) {
  console.error(`${HATA} STATS_SECRET ortam değişkeni tanımlı değil.`);
  console.error(`   set STATS_SECRET=<secret> && node scripts/d1-sayim-kontrol.mjs`);
  process.exit(1);
}

async function fetchTimeout(url, opts = {}, ms = 10_000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  console.log(`${INFO} API: ${API_BASE}`);
  console.log("");

  let res;
  try {
    res = await fetchTimeout(`${API_BASE}/istatistik/sayim`, {
      headers: { Authorization: `Bearer ${STATS_SECRET}` },
    });
  } catch (e) {
    console.error(`${HATA} Bağlantı hatası: ${e.message}`);
    console.error(`   Backend deploy edilmemiş olabilir → cd backend/api && npx wrangler deploy`);
    process.exit(1);
  }

  if (res.status === 401) {
    console.error(`${HATA} 401 Unauthorized — STATS_SECRET yanlış.`);
    process.exit(1);
  }
  if (!res.ok) {
    console.error(`${HATA} HTTP ${res.status}: ${await res.text()}`);
    process.exit(1);
  }

  const data = await res.json();

  console.log(`${INFO} Kategori dağılımı (aktif ilanlar):`);
  const kategoriler = data.kategori || {};
  for (const [kat, adet] of Object.entries(kategoriler).sort((a, b) => b[1] - a[1])) {
    const bar = "█".repeat(Math.min(40, Math.ceil(adet / 500)));
    console.log(`   ${kat.padEnd(12)} ${String(adet).padStart(8)}  ${bar}`);
  }

  console.log("");
  const arsaTarla = data.arsa_tarla_toplam ?? 0;
  const hedef = 50_000;
  const eksik = Math.max(0, hedef - arsaTarla);
  const pct = Math.min(100, Math.round((arsaTarla / hedef) * 100));

  if (data.hedef_50k) {
    console.log(`${OK} ${BOLD}arsa+tarla toplam: ${arsaTarla.toLocaleString("tr-TR")} ≥ ${hedef.toLocaleString("tr-TR")}${RESET} (hedef karşılandı ✓)`);
  } else {
    console.log(`${WARN} ${BOLD}arsa+tarla toplam: ${arsaTarla.toLocaleString("tr-TR")} / ${hedef.toLocaleString("tr-TR")}${RESET} — %${pct} — eksik: ${eksik.toLocaleString("tr-TR")}`);
    console.log("");
    console.log(`${INFO} Veri çekmek için: TAM-VERI-CEK.bat`);
  }

  console.log(`${INFO} Toplam aktif ilan: ${(data.aktif ?? 0).toLocaleString("tr-TR")}`);
  console.log(`${INFO} Toplam ilan (aktif+pasif): ${(data.toplam ?? 0).toLocaleString("tr-TR")}`);

  if (!data.hedef_50k) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
