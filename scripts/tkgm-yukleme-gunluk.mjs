#!/usr/bin/env node
/**
 * scripts/tkgm-yukleme-gunluk.mjs
 *
 * `tkgm-analiz-eksik-ayir.mjs`'in ürettiği parçalardan SIRADAKİNİ D1'e yükler.
 * Günde bir kez çalıştırılır — D1 ücretsiz katman günlük 100.000 yazma.
 *
 * ÖLÇÜLMÜŞ BÜTÇE (2026-09-12, canlı): satır başına 2,0 yazma (tablo + benzersiz
 * indeks; gereksiz indeks 0040 ile kaldırıldı, öncesi 3,0). 40.000 satırlık
 * parça ≈ 80.000 yazma → diğer cron'lara ~20.000 pay kalıyor.
 *
 * Yerel çalışır, wrangler'ın YEREL oturumunu kullanır. CI'a taşınmadı: bu
 * depodaki kural "CI hiçbir production credential taşımaz" (bkz.
 * .github/workflows/gunluk-tkgm-analiz.yml başı).
 *
 * Kullanım:
 *   node scripts/tkgm-yukleme-gunluk.mjs            # sıradaki parça
 *   node scripts/tkgm-yukleme-gunluk.mjs --durum    # yalnızca ilerlemeyi göster
 *
 * Çıkış kodları: 0 yüklendi / hepsi bitti · 1 hata · 3 D1 limiti (yarın tekrar)
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";

const KOK = resolve(import.meta.dirname, "..");
const DIZIN = join(KOK, "scripts", "tkgm-yukleme");
const DURUM = join(DIZIN, "durum.json");
const API_DIZIN = join(KOK, "backend", "api");

const durum = existsSync(DURUM)
  ? JSON.parse(readFileSync(DURUM, "utf8"))
  : { yuklenen: [] };

const parcalar = readdirSync(DIZIN).filter((f) => /^\d+-(ozet|nokta)\.sql$/.test(f)).sort();
const kalan = parcalar.filter((p) => !durum.yuklenen.some((y) => y.dosya === p));

if (process.argv.includes("--durum")) {
  console.log(`yüklenen: ${durum.yuklenen.length}/${parcalar.length}`);
  for (const y of durum.yuklenen) {
    console.log(`  ${y.dosya}  ${y.zaman}  eklenen=${y.eklenen}  yazma=${y.yazma}`);
  }
  console.log(`kalan: ${kalan.join(", ") || "—"}`);
  process.exit(0);
}

if (kalan.length === 0) {
  console.log("Tüm parçalar yüklenmiş.");
  process.exit(0);
}

const dosya = kalan[0];
console.log(`yükleniyor: ${dosya} (${kalan.length} parça kaldı)`);

let cikti;
try {
  cikti = execFileSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["wrangler", "d1", "execute", "cadastrum-db", "--remote", "--yes", "--json", `--file=${join(DIZIN, dosya)}`],
    { cwd: API_DIZIN, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, shell: process.platform === "win32" },
  );
} catch (e) {
  const metin = `${e.stdout ?? ""}${e.stderr ?? ""}`;
  // Limit hatası beklenen bir durum — parça İŞARETLENMEZ, yarın aynı parça
  // tekrar denenir. INSERT OR IGNORE sayesinde yarım kalan parça güvenle
  // yeniden yüklenebilir.
  if (/7500|exceeded|limit/i.test(metin)) {
    console.error(`D1 günlük limiti — ${dosya} yarın tekrar denenecek.`);
    process.exit(3);
  }
  console.error(`HATA (${dosya}):\n${metin.slice(0, 2000)}`);
  process.exit(1);
}

// wrangler --json çıktısında meta alanlarını topla. Sonuç okunamazsa parça
// yüklendi SAYILMAZ — "komut hata vermedi" ile "veri yazıldı" aynı şey değil.
const yazma = [...cikti.matchAll(/"rows_written":\s*(\d+)/g)].reduce((s, m) => s + Number(m[1]), 0);
const eklenen = [...cikti.matchAll(/"changes":\s*(\d+)/g)].reduce((s, m) => s + Number(m[1]), 0);
if (yazma === 0 && eklenen === 0) {
  console.error(`HATA: ${dosya} için yazma/değişiklik sayısı okunamadı — işaretlenmedi.\n${cikti.slice(0, 1000)}`);
  process.exit(1);
}

durum.yuklenen.push({ dosya, zaman: new Date().toISOString(), eklenen, yazma });
writeFileSync(DURUM, JSON.stringify(durum, null, 2));
console.log(`✓ ${dosya}: eklenen=${eklenen} yazma=${yazma} (satır başına ${(yazma / Math.max(eklenen, 1)).toFixed(2)})`);
console.log(`kalan parça: ${kalan.length - 1}`);
