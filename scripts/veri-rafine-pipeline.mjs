#!/usr/bin/env node
/**
 * Veri Rafineri Boru Hattı (Data Refinery Pipeline)
 *
 * Ham ilan veri tabanlarını (SQL) alıp:
 * 1. Geçersiz alan/fiyat kayıtlarını ayıklar.
 * 2. Bağlamsal (İl + Kategori) mutlak sınır filtresi uygular (bkz. IL_KATEGORI_SINIR,
 *    src/lib/fiyat-correction.ts — bu tablo o dosyayla senkron tutulmalı).
 * 3. İl + İlçe + Kategori bazında gruplu Tukey IQR outlier filtresi uygular.
 * 4. Çıktı olarak D1 `ilanlar` şemasıyla BİREBİR uyumlu, yüklenebilir SQL ve
 *    özet JSON raporu üretir.
 *
 * NOT (önceki sürümden fark): Hukuki kısıt (hisseli/kooperatif/hobi bahçesi/2B)
 * NLP taraması bu script'ten kaldırıldı. Girdi SQL'inde başlık/açıklama alanı
 * bulunmuyor (yalnızca il/ilçe/mahalle/fiyat/m²/kategori) — taramanın önceki
 * hâli yalnızca "{mahalle} {ilçe}" metnine bakıyordu ve yapısal olarak hiçbir
 * zaman eşleşemiyordu (bkz. data/refined-data-rapor.json: hukukiKisit: 0).
 * Başlık/açıklama metni gerektiren sanitasyon, bu metnin mevcut olduğu çalışma
 * zamanı yolunda yapılır: src/lib/fiyat/data-sanitizer.ts + outlier-engine.ts,
 * src/lib/fiyat/bolge-baseline.ts üzerinden emsal havuzuna bağlıdır.
 *
 * Kullanım:
 *   node scripts/veri-rafine-pipeline.mjs
 *   node scripts/veri-rafine-pipeline.mjs --dosya=scripts/emlakjet-data-turkiye.sql
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// İl + kategori bazlı makul TL/m² sınırları — src/lib/fiyat-correction.ts:IL_KATEGORI_SINIR
// ile senkron tutulmalıdır (tek doğruluk kaynağı orası; bu, standalone Node
// script'inin TS derlemesine bağımlı olmadan aynı sınırları kullanabilmesi için
// bilinçli bir kopyadır).
const IL_KATEGORI_SINIR = {
  "istanbul:arsa": { altMin: 500, ustMax: 100_000_000 },
  "istanbul:tarla": { altMin: 200, ustMax: 10_000_000 },
  "izmir:arsa": { altMin: 300, ustMax: 50_000_000 },
  "izmir:tarla": { altMin: 100, ustMax: 5_000_000 },
  "ankara:arsa": { altMin: 300, ustMax: 50_000_000 },
  "ankara:tarla": { altMin: 100, ustMax: 3_000_000 },
  "antalya:arsa": { altMin: 300, ustMax: 30_000_000 },
  "antalya:tarla": { altMin: 100, ustMax: 5_000_000 },
  "mugla:arsa": { altMin: 300, ustMax: 30_000_000 },
  "mugla:tarla": { altMin: 100, ustMax: 8_000_000 },
  "bursa:arsa": { altMin: 200, ustMax: 20_000_000 },
  "kocaeli:arsa": { altMin: 200, ustMax: 20_000_000 },
  "tekirdag:arsa": { altMin: 150, ustMax: 15_000_000 },
  "_default:arsa": { altMin: 50, ustMax: 20_000_000 },
  "_default:tarla": { altMin: 30, ustMax: 3_000_000 },
  "_default:bahce": { altMin: 50, ustMax: 5_000_000 },
  "_default:bag": { altMin: 30, ustMax: 2_000_000 },
  "_default:zeytinlik": { altMin: 50, ustMax: 2_000_000 },
  "_default:konut": { altMin: 1_000, ustMax: 100_000_000 },
};

function sinirGetir(ilNorm, kategori) {
  return (
    IL_KATEGORI_SINIR[`${ilNorm}:${kategori}`] ??
    IL_KATEGORI_SINIR[`_default:${kategori}`] ??
    IL_KATEGORI_SINIR["_default:arsa"]
  );
}

/**
 * D1 `ilanlar` şeması satır formatı (schema.sql / migrate-allow-emlakjet.sql):
 * (kaynak, ilan_no, il_norm, ilce_norm, mahalle_norm, fiyat_per_m2, m2, kategori,
 *  para_birimi, yakalanma_tarihi, lat, lng, koord_kaynagi, aktif)
 */
function parseSqlRows(metin) {
  const kayitlar = [];
  const blokRegex = /INSERT OR IGNORE INTO ilanlar[^;]+;/gs;
  const satirRegex =
    /\('([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)',\s*(?:'([^']*)'|NULL),\s*([0-9.]+),\s*([0-9.]+),\s*'([^']+)',\s*'([^']+)',\s*([0-9]+),\s*(?:(-?[0-9.]+)|NULL),\s*(?:(-?[0-9.]+)|NULL),\s*(?:'([^']*)'|NULL),\s*([0-9]+)/g;

  for (const blok of metin.match(blokRegex) || []) {
    let m;
    satirRegex.lastIndex = 0;
    while ((m = satirRegex.exec(blok)) !== null) {
      const mahalle = m[5] || null;
      const tlm2 = Math.round(parseFloat(m[6]));
      const m2 = Math.round(parseFloat(m[7]));
      kayitlar.push({
        kaynak: m[1],
        ilanNo: m[2],
        il: m[3],
        ilce: m[4],
        mahalle,
        tlm2,
        m2,
        kategori: m[8],
        paraBirimi: m[9],
        tarihTs: parseInt(m[10], 10),
        lat: m[11] !== undefined ? parseFloat(m[11]) : null,
        lng: m[12] !== undefined ? parseFloat(m[12]) : null,
        koordKaynagi: m[13] || null,
        aktif: parseInt(m[14], 10),
      });
    }
  }
  return kayitlar;
}

/** Lineer interpolasyonlu percentile — outlier-engine.ts:hesaplaPercentile ile aynı formül. */
function percentile(arr, p) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const index = (s.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return (s[lower] ?? 0) * (1 - weight) + (s[upper] ?? s[lower] ?? 0) * weight;
}

async function runPipeline() {
  const args = process.argv.slice(2);
  const dosyaArg = args.find((a) => a.startsWith("--dosya="))?.split("=")[1];
  const dosyaYolu = dosyaArg ? join(ROOT, dosyaArg) : join(ROOT, "scripts/emlakjet-data-turkiye.sql");

  if (!existsSync(dosyaYolu)) {
    console.error(`❌ Dosya bulunamadı: ${dosyaYolu}`);
    process.exit(1);
  }

  console.log(`\n🚀 Veri Rafineri Boru Hattı Başlatılıyor...`);
  console.log(`📂 Girdi Dosyası: ${dosyaYolu}`);

  const metin = readFileSync(dosyaYolu, "utf8");
  const hamKayitlar = parseSqlRows(metin);
  console.log(`📊 Toplam Ham Kayıt: ${hamKayitlar.length.toLocaleString("tr-TR")}`);

  let elenenGecersizM2Fiyat = 0;
  let elenenMutlakSinir = 0;
  let elenenIQR = 0;

  const adaylar = [];

  for (const k of hamKayitlar) {
    // 1. Temel Doğrulama
    if (!k.tlm2 || k.tlm2 <= 0 || !k.m2 || k.m2 <= 0) {
      elenenGecersizM2Fiyat++;
      continue;
    }

    // 2. Mutlak Sınırlar (İl + Kategori bağlamsal)
    const sinir = sinirGetir(k.il, k.kategori);
    if (k.tlm2 < sinir.altMin || k.tlm2 > sinir.ustMax) {
      elenenMutlakSinir++;
      continue;
    }

    adaylar.push(k);
  }

  // 3. İl + İlçe + Kategori Bazında Gruplu Tukey IQR Temizleme
  const gruplar = {};
  for (const a of adaylar) {
    const key = `${a.il}__${a.ilce}__${a.kategori}`;
    (gruplar[key] ||= []).push(a);
  }

  const rafineHavuz = [];

  for (const items of Object.values(gruplar)) {
    if (items.length >= 4) {
      const fiyatlar = items.map((i) => i.tlm2);
      const q1 = percentile(fiyatlar, 0.25);
      const q3 = percentile(fiyatlar, 0.75);
      const iqr = q3 - q1;
      const altSinir = Math.max(10, q1 - 1.5 * iqr);
      const ustSinir = q3 + 1.5 * iqr;

      for (const item of items) {
        if (item.tlm2 >= altSinir && item.tlm2 <= ustSinir) {
          rafineHavuz.push(item);
        } else {
          elenenIQR++;
        }
      }
    } else {
      rafineHavuz.push(...items);
    }
  }

  console.log(`\n✨ Rafinasyon Sonuçları:`);
  console.log(`   ✅ Temiz ve Rafine İlanlar : ${rafineHavuz.length.toLocaleString("tr-TR")} (%${((rafineHavuz.length / hamKayitlar.length) * 100).toFixed(1)})`);
  console.log(`   🚫 Elenen Geçersiz Değer   : ${elenenGecersizM2Fiyat.toLocaleString("tr-TR")}`);
  console.log(`   🚫 Elenen Mutlak Sınır Dışı: ${elenenMutlakSinir.toLocaleString("tr-TR")}`);
  console.log(`   🚫 Elenen İstatistiksel IQR: ${elenenIQR.toLocaleString("tr-TR")}`);

  // Çıktı Dosyaları — D1 `ilanlar` şemasıyla birebir uyumlu.
  const ciktiSql = join(ROOT, "scripts/emlakjet-data-refined.sql");
  const sqlLines = [
    "-- Cadastrum Veri Rafinerisi ile Temizlenmiş ve Normalize Edilmiş Veri Seti",
    "-- Tarih: " + new Date().toISOString(),
    `-- Toplam Temiz Kayıt: ${rafineHavuz.length}`,
    "",
  ];

  const CHUNK = 100;
  for (let i = 0; i < rafineHavuz.length; i += CHUNK) {
    const dilim = rafineHavuz.slice(i, i + CHUNK);
    const values = dilim
      .map((r) => {
        const mahalleVal = r.mahalle ? `'${r.mahalle.replace(/'/g, "''")}'` : "NULL";
        const latVal = r.lat != null && !Number.isNaN(r.lat) ? r.lat : "NULL";
        const lngVal = r.lng != null && !Number.isNaN(r.lng) ? r.lng : "NULL";
        const koordVal = r.koordKaynagi ? `'${r.koordKaynagi.replace(/'/g, "''")}'` : "NULL";
        return `('${r.kaynak}','${r.ilanNo}','${r.il}','${r.ilce}',${mahalleVal},${r.tlm2},${r.m2},'${r.kategori}','${r.paraBirimi}',${r.tarihTs || Date.now()},${latVal},${lngVal},${koordVal},${r.aktif ?? 1})`;
      })
      .join(",\n  ");

    sqlLines.push(
      `INSERT OR IGNORE INTO ilanlar (kaynak, ilan_no, il_norm, ilce_norm, mahalle_norm, fiyat_per_m2, m2, kategori, para_birimi, yakalanma_tarihi, lat, lng, koord_kaynagi, aktif) VALUES\n  ${values};`,
    );
  }

  writeFileSync(ciktiSql, sqlLines.join("\n"), "utf8");
  console.log(`\n💾 Rafine SQL Kaydedildi: ${ciktiSql}`);

  const rapor = {
    tarih: new Date().toISOString(),
    hamKayitSayisi: hamKayitlar.length,
    temizKayitSayisi: rafineHavuz.length,
    kayipOraniYuzde: Number((((hamKayitlar.length - rafineHavuz.length) / hamKayitlar.length) * 100).toFixed(2)),
    elenenler: {
      gecersizAlanFiyat: elenenGecersizM2Fiyat,
      mutlakSinir: elenenMutlakSinir,
      istatistikselIqr: elenenIQR,
    },
    not: "Hukuki kısıt (hisseli/kooperatif/hobi/2B) taraması bu script'te yapılmaz — girdi SQL'inde başlık/açıklama alanı yok. Bkz. src/lib/fiyat/data-sanitizer.ts (çalışma zamanı yolu).",
  };

  const raporYolu = join(ROOT, "data/refined-data-rapor.json");
  writeFileSync(raporYolu, JSON.stringify(rapor, null, 2), "utf8");
  console.log(`📄 Rapor Kaydedildi: ${raporYolu}\n`);
}

runPipeline().catch(console.error);
