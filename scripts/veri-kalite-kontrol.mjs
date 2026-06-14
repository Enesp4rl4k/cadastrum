#!/usr/bin/env node
/**
 * Scraping verisi kalite kontrolü — AI yok, sadece gerçek ilan SQL/JSON.
 *
 *   node scripts/veri-kalite-kontrol.mjs
 *   node scripts/veri-kalite-kontrol.mjs --dosya=scripts/emlakjet-data-full.sql
 *
 * Çıktı: data/veri-kalite-rapor.json + konsol özeti
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const args = process.argv.slice(2);
const dosyaArg = args.find((a) => a.startsWith("--dosya="))?.split("=")[1];
const DOSYALAR = dosyaArg
  ? [join(ROOT, dosyaArg)]
  : [
      join(ROOT, "scripts/emlakjet-data-turkiye.sql"),
      join(ROOT, "scripts/emlakjet-data-full.sql"),
      join(ROOT, "scripts/emlakjet-data.sql"),
    ].filter((p) => existsSync(p));

if (DOSYALAR.length === 0) {
  console.error("HATA: SQL dosyası yok. Önce emlakjet-scrape-full.mjs çalıştır.");
  process.exit(1);
}

function parseSqlRows(metin) {
  const kayitlar = [];
  const blokRegex = /INSERT OR IGNORE INTO ilanlar[^;]+;/gs;
  for (const blok of metin.match(blokRegex) || []) {
    const satirRegex = /\('(?:extension|emlakjet)','[^']+','([^']*)','([^']*)',([^,]+),(\d+),(\d+),'([^']+)'/g;
    let m;
    while ((m = satirRegex.exec(blok)) !== null) {
      const mahalle = m[3] === "NULL" ? null : m[3].replace(/^'|'$/g, "");
      kayitlar.push({
        il: m[1],
        ilce: m[2],
        mahalle,
        tlm2: parseInt(m[4], 10),
        m2: parseInt(m[5], 10),
        kategori: m[6],
      });
    }
  }
  return kayitlar;
}

function yuzdelik(arr, p) {
  const s = [...arr].sort((a, b) => a - b);
  if (!s.length) return 0;
  const i = Math.floor((s.length - 1) * p);
  return s[i];
}

function iqrFiltre(degerler) {
  const q1 = yuzdelik(degerler, 0.25);
  const q3 = yuzdelik(degerler, 0.75);
  const iqr = q3 - q1;
  const alt = q1 - 1.5 * iqr;
  const ust = q3 + 1.5 * iqr;
  return degerler.filter((v) => v >= alt && v <= ust);
}

const rapor = { dosyalar: [], toplam: 0, oneriler: [] };

for (const dosya of DOSYALAR) {
  console.log(`\n📋 ${dosya.replace(ROOT + "\\", "").replace(ROOT + "/", "")}`);
  const metin = readFileSync(dosya, "utf8");
  const kayitlar = parseSqlRows(metin);
  console.log(`   ${kayitlar.length.toLocaleString("tr-TR")} ilan satırı`);

  const kategori = {};
  const tlm2ler = [];
  const aykiri = [];
  const mahalleSayac = {};
  let koordsuz = 0, dusukM2 = 0, yuksekTlm2 = 0;

  for (const k of kayitlar) {
    kategori[k.kategori] = (kategori[k.kategori] || 0) + 1;
    tlm2ler.push(k.tlm2);
    if (k.m2 < 50) dusukM2++;
    if (k.tlm2 < 100) aykiri.push({ ...k, neden: "tlm2<100" });
    else if (k.tlm2 > 500_000) { yuksekTlm2++; aykiri.push({ ...k, neden: "tlm2>500k" }); }
    if (!k.mahalle) koordsuz++;
    const mk = `${k.il}__${k.ilce}__${k.mahalle || "_"}`;
    mahalleSayac[mk] = (mahalleSayac[mk] || 0) + 1;
  }

  const temizTlm2 = iqrFiltre(tlm2ler);
  const outlierSayi = tlm2ler.length - temizTlm2.length;

  const mahalleler = Object.entries(mahalleSayac);
  const tekIlanMahalle = mahalleler.filter(([, n]) => n === 1).length;
  const zenginMahalle = mahalleler.filter(([, n]) => n >= 3).length;

  const ozet = {
    dosya,
    ilanSayisi: kayitlar.length,
    kategori,
    tlm2: {
      min: Math.min(...tlm2ler),
      p25: yuzdelik(tlm2ler, 0.25),
      medyan: yuzdelik(tlm2ler, 0.5),
      p75: yuzdelik(tlm2ler, 0.75),
      max: Math.max(...tlm2ler),
      ort: Math.round(tlm2ler.reduce((a, b) => a + b, 0) / tlm2ler.length),
    },
    sorunlar: {
      iqrOutlier: outlierSayi,
      tlm2_cok_dusuk: aykiri.filter((a) => a.neden === "tlm2<100").length,
      tlm2_cok_yuksek: yuksekTlm2,
      m2_cok_kucuk: dusukM2,
      mahalle_norm_bos: koordsuz,
    },
    mahalle: {
      unique: mahalleler.length,
      tek_ilan: tekIlanMahalle,
      uc_arti_ilan: zenginMahalle,
    },
    ornekAykiri: aykiri.slice(0, 10),
  };

  rapor.dosyalar.push(ozet);
  rapor.toplam += kayitlar.length;

  console.log(`   Kategori: ${JSON.stringify(kategori)}`);
  console.log(`   TL/m² medyan: ${ozet.tlm2.medyan.toLocaleString("tr-TR")} (P25–P75: ${ozet.tlm2.p25}–${ozet.tlm2.p75})`);
  console.log(`   IQR outlier: ${outlierSayi} | mahalle≥3 ilan: ${zenginMahalle}`);
  if (kayitlar.length < 5000) {
    rapor.oneriler.push(`${dosya}: az kayıt — scrape devam et veya MAX_SAYFA artır`);
  }
  if (outlierSayi / kayitlar.length > 0.05) {
    rapor.oneriler.push(`${dosya}: outlier oranı yüksek — QC sonrası IQR filtre uygula`);
  }
}

rapor.oneriler.push("AI baseline kullanma — node scripts/baseline-ts-uret.mjs sonra build");
rapor.oneriler.push("D1 yükle: SEED-EMLAKJET-FULL.bat → wrangler istatistik refresh");

const cikti = join(ROOT, "data/veri-kalite-rapor.json");
writeFileSync(cikti, JSON.stringify(rapor, null, 2), "utf8");
console.log(`\n✅ Rapor: data/veri-kalite-rapor.json (toplam ${rapor.toplam} ilan)`);
