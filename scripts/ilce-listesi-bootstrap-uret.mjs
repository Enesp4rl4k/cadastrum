#!/usr/bin/env node
/**
 * data/mahalleler.json → src/lib/data/ilce-listesi-bootstrap.ts
 *
 * Extension içine 973 ilçenin URL slug'ı + il/ilçe adı gömülür.
 * Background bootstrap modu bu listeyi kullanarak Sahibinden sayfalarını
 * arka plan tab'larında açıp content-script ile tarar.
 *
 * Çalıştır:
 *   node scripts/ilce-listesi-bootstrap-uret.mjs
 */
import { writeFileSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GIRDI = `${__dirname}/../data/mahalleler.json`;
const ÇIKTI = `${__dirname}/../src/lib/data/ilce-listesi-bootstrap.ts`;

const tum = JSON.parse(readFileSync(GIRDI, "utf8"));
const seen = new Set();
const liste = [];
for (const m of tum) {
  if (!m.il || !m.ilce || !m.ilNorm || !m.ilceNorm) continue;
  const key = `${m.ilNorm}__${m.ilceNorm}`;
  if (seen.has(key)) continue;
  seen.add(key);
  liste.push({ il: m.il, ilce: m.ilce, ilNorm: m.ilNorm, ilceNorm: m.ilceNorm });
}
liste.sort((a, b) =>
  a.ilNorm === b.ilNorm ? a.ilceNorm.localeCompare(b.ilceNorm) : a.ilNorm.localeCompare(b.ilNorm),
);

const içerik = `/**
 * Otomatik üretildi: ${new Date().toISOString()}
 * Kaynak: data/mahalleler.json
 *
 * !!! BU DOSYAYI ELLE DÜZENLEME !!!
 * Yenile: node scripts/ilce-listesi-bootstrap-uret.mjs
 *
 * ${liste.length} unique il/ilçe.
 * Sahibinden URL slug formatı: \`{ilNorm}-{ilceNorm}\` (örn: "istanbul-kadikoy")
 */

export interface BootstrapIlce {
  il: string;
  ilce: string;
  ilNorm: string;
  ilceNorm: string;
}

export const BOOTSTRAP_ILCE_LISTESI: BootstrapIlce[] = ${JSON.stringify(liste, null, 2)};

/** İle göre ilçeleri grupla — UI il seçici için */
export function bootstrapIlleriGetir(): string[] {
  return [...new Set(BOOTSTRAP_ILCE_LISTESI.map((i) => i.il))].sort((a, b) => a.localeCompare(b, "tr"));
}

/** Belirli il için ilçeler */
export function bootstrapIlcelerGetir(il: string): BootstrapIlce[] {
  return BOOTSTRAP_ILCE_LISTESI.filter((i) => i.il === il);
}
`;

writeFileSync(ÇIKTI, içerik, "utf8");
console.log(`✓ ${liste.length} ilçe → ${ÇIKTI} (${(içerik.length / 1024).toFixed(0)} KB)`);
