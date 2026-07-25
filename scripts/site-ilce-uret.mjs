#!/usr/bin/env node
/**
 * site/src/data/ilce-listesi.ts üretici
 *
 * Kaynak: src/lib/data/ilce-listesi-bootstrap.ts (973 unique ilçe)
 * Çıktı:  site/src/data/ilce-listesi.ts (slim — sadece ilNorm+ilceNorm)
 *
 * Kullanım:
 *   node scripts/site-ilce-uret.mjs
 *
 * Astro build öncesi çalıştırılır — site/src/pages/veri/[il]/[ilce].astro
 * ve sitemap.xml.ts bu dosyayı import eder.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const KAYNAK = join(__dirname, "../src/lib/data/ilce-listesi-bootstrap.ts");
const CIKTI = join(__dirname, "../site/src/data/ilce-listesi.ts");

// TS dosyasını text olarak oku ve JSON array'i çıkar
const metin = readFileSync(KAYNAK, "utf8");
// BOOTSTRAP_ILCE_LISTESI = [...] kısmını çıkar
const eslesme = metin.match(/BOOTSTRAP_ILCE_LISTESI:\s*\w+\[\]\s*=\s*(\[[\s\S]*?\]);/);
if (!eslesme) {
  console.error("HATA: BOOTSTRAP_ILCE_LISTESI parse edilemedi");
  process.exit(1);
}

const liste = JSON.parse(eslesme[1]);
console.log(`Toplam ${liste.length} il/ilçe çiftlendi.`);

// Sadece ilNorm + ilceNorm al
const slim = liste.map(({ ilNorm, ilceNorm }) => ({ il: ilNorm, ilce: ilceNorm }));

const icerik = `/**
 * Otomatik üretildi: ${new Date().toISOString()}
 * Kaynak: src/lib/data/ilce-listesi-bootstrap.ts
 *
 * !!! BU DOSYAYI ELLE DÜZENLEME !!!
 * Yenile: node scripts/site-ilce-uret.mjs
 *
 * ${slim.length} unique il/ilçe (slim — sadece norm değerler).
 * site/src/pages/veri/[il]/[ilce].astro ve sitemap.xml.ts bu dosyayı kullanır.
 */

export interface SiteIlce {
  il: string;   // norm (örn: "istanbul")
  ilce: string; // norm (örn: "kadikoy")
}

export const SITE_ILCE_LISTESI: SiteIlce[] = ${JSON.stringify(slim, null, 2)};
`;

writeFileSync(CIKTI, icerik, "utf8");
console.log(`✓ ${CIKTI} yazıldı (${slim.length} ilçe).`);
