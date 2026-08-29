#!/usr/bin/env node
/**
 * poi_noktalari seed SQL üreteci.
 *
 * NEDEN: `poi_noktalari` tablosu migration 0017'de kuruldu ama HİÇ
 * DOLDURULMADI (üretimde 0 satır). `/v1/harita/poi` endpoint'i
 * (backend/api/src/routes/harita.ts:182) bu tablodan okuyor, dolayısıyla
 * harita POI katmanı — OSB, havalimanı, liman, lojistik — fiilen ölü.
 *
 * `mahalle_merkez` ile birebir aynı sınıf boşluk: statik veri extension'da
 * hazır duruyor, tablo şema olarak mevcut, aradaki seed adımı hiç atılmamış.
 *
 * Kaynaklar (src/lib/data/):
 *   OSBLAR              → kategori 'osb'
 *   HAVALIMANLARITÜMÜ   → kategori 'havalimanı'
 *   LIMANLAR            → kategori 'liman'
 *   LISANSLI_DEPOLAR    → kategori 'lojistik', alt_tip = tip alanı
 *   SERBEST_BOLGELER    → kategori 'lojistik', alt_tip = tip alanı
 *
 * Kategori değerleri harita.ts'teki doğrulama listesiyle birebir aynı olmalı
 * ('osb' | 'havalimanı' | 'liman' | 'lojistik'), aksi hâlde endpoint
 * "Geçersiz kategori" döner.
 *
 * Kullanım:
 *   node scripts/poi-seed-uret.mjs > scripts/poi-seed.sql
 *   cd backend/api && npx wrangler d1 execute cadastrum-db --remote \
 *     --file ../../scripts/poi-seed.sql
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** TS dosyasındaki dizi literalini JSON'a çevirip parse eder. */
function diziCikar(dosya, sabitAdi) {
  const metin = readFileSync(join(ROOT, "src/lib/data", dosya), "utf8");
  const bas = metin.indexOf(`export const ${sabitAdi}`);
  if (bas === -1) throw new Error(`${sabitAdi} bulunamadı (${dosya})`);
  const acilis = metin.indexOf("= [", bas);
  if (acilis === -1) throw new Error(`${sabitAdi} dizi açılışı yok`);
  const kapanis = metin.indexOf("\n];", acilis);
  if (kapanis === -1) throw new Error(`${sabitAdi} dizi kapanışı yok`);
  let govde = metin.slice(acilis + 2, kapanis + 2);

  // TS obje literalini JSON'a çevir: yorumları at, anahtarları tırnakla,
  // sondaki fazla virgülleri temizle.
  govde = govde
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/([{,]\s*)([A-Za-zçğıöşüÇĞİÖŞÜ_][A-Za-z0-9_]*)\s*:/g, '$1"$2":')
    .replace(/,(\s*[}\]])/g, "$1");
  return JSON.parse(govde);
}

const slugla = (s) =>
  s.toLocaleLowerCase("tr")
    .replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ı/g, "i")
    .replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const KAYNAKLAR = [
  { dosya: "osblar.ts", sabit: "OSBLAR", kategori: "osb" },
  { dosya: "havalimanları.ts", sabit: "HAVALIMANLARITÜMÜ", kategori: "havalimanı" },
  { dosya: "limanlar.ts", sabit: "LIMANLAR", kategori: "liman" },
  { dosya: "lisansli-depolar.ts", sabit: "LISANSLI_DEPOLAR", kategori: "lojistik" },
  { dosya: "serbest-bolgeler.ts", sabit: "SERBEST_BOLGELER", kategori: "lojistik" },
];

const q = (v) => (v == null ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
const satirlar = [];
const gorulenId = new Set();
const sayac = {};
let atlanan = 0;

for (const { dosya, sabit, kategori } of KAYNAKLAR) {
  const kayitlar = diziCikar(dosya, sabit);
  for (const k of kayitlar) {
    if (!k?.ad || !k?.il) { atlanan++; continue; }
    const lat = Number(k.lat), lng = Number(k.lng);
    // Türkiye bbox — bozuk koordinatı tabloya sokma.
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) { atlanan++; continue; }
    if (lat < 35 || lat > 43 || lng < 25 || lng > 45) { atlanan++; continue; }

    let id = `${kategori}-${slugla(k.il)}-${slugla(k.ad)}`;
    // id PRIMARY KEY — aynı ad+il iki kez geçerse ayır.
    if (gorulenId.has(id)) {
      let n = 2;
      while (gorulenId.has(`${id}-${n}`)) n++;
      id = `${id}-${n}`;
    }
    gorulenId.add(id);

    satirlar.push(
      `(${q(id)}, ${q(kategori)}, ${q(k.tip ?? null)}, ${q(k.ad)}, ${q(k.il)}, ${lat}, ${lng}, NULL)`,
    );
    sayac[kategori] = (sayac[kategori] ?? 0) + 1;
  }
}

const out = [
  "-- Otomatik üretildi: scripts/poi-seed-uret.mjs",
  `-- ${satirlar.length} POI (${atlanan} atlandı: eksik alan veya bbox dışı)`,
  `-- Kırılım: ${Object.entries(sayac).map(([k, v]) => `${k} ${v}`).join(" · ")}`,
  "",
];
const PARTI = 300;
for (let i = 0; i < satirlar.length; i += PARTI) {
  out.push(
    "INSERT INTO poi_noktalari (id, kategori, alt_tip, ad, il, lat, lng, meta)\nVALUES\n  " +
      satirlar.slice(i, i + PARTI).join(",\n  ") +
      "\nON CONFLICT(id) DO UPDATE SET\n" +
      "  kategori = excluded.kategori, alt_tip = excluded.alt_tip,\n" +
      "  ad = excluded.ad, il = excluded.il,\n" +
      "  lat = excluded.lat, lng = excluded.lng;",
  );
  out.push("");
}

process.stderr.write(
  `${satirlar.length} POI · ${Object.entries(sayac).map(([k, v]) => `${k} ${v}`).join(" · ")}` +
  ` (${atlanan} atlandı)\n`,
);
process.stdout.write(out.join("\n"));
