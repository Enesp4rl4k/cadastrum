#!/usr/bin/env node
/**
 * scripts/tkgm-analiz-seed.mjs
 *
 * TKGM analiz verisini çeker ve SQL dosyasına yazar (D1'e DOĞRUDAN YAZMAZ —
 * emlakjet-scrape-turkiye.mjs ile aynı desen: CI hiçbir production credential
 * taşımaz, D1'e yükleme insan onayıyla MANUEL yapılır):
 *   cd backend/api && npx wrangler d1 execute cadastrum-db --remote --file=../../scripts/tkgm-analiz-data-{tip}-{yil}.sql
 *
 * Sonraki çalıştırmalarda ilerleme dosyasından kaldığı ilçeden devam eder.
 *
 * Kullanım:
 *   node scripts/tkgm-analiz-seed.mjs
 *   node scripts/tkgm-analiz-seed.mjs --tip 1 --yil 2024
 *   node scripts/tkgm-analiz-seed.mjs --tip 1 --yil 2024 --il 34  (sadece İstanbul)
 *
 * Strateji (TKGM ban riskini minimize et):
 *   - İlçe başına 2 saniye bekleme
 *   - Hata durumunda 10 saniye bekle + 1 retry
 *   - Günlük ~500 istek limiti — her il için ayrı gün planla
 */

import { writeFileSync, appendFileSync, readFileSync, existsSync } from "fs";

// ─── Argüman parse ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
};

const HEDEF_TIP  = getArg("tip")  ? Number(getArg("tip"))  : 1;
const HEDEF_YIL  = getArg("yil")  ? Number(getArg("yil"))  : new Date().getFullYear() - 1;
const SADECE_IL  = getArg("il")   ? Number(getArg("il"))   : null;
const KURU_CALIS = args.includes("--dry-run");

const ILCE_GECIKME_MS   = 2000;  // İlçe başına bekleme
const HATA_BEKLEME_MS   = 10000; // Hata sonrası bekleme
const MAX_RETRY         = 1;

const TKGM_ANALIZ_BASE  = "https://cbsapi.tkgm.gov.tr/megsiswebapi.v3.1/api/analiz";
const TKGM_IDARI_BASE   = "https://cbsapi.tkgm.gov.tr/megsiswebapi.v3.1/api/idariYapi";

// İlerleme dosyası — script yarıda kesilirse kaldığı yerden devam eder
const ILERLEME_DOSYA = `scripts/.analiz-seed-ilerleme-${HEDEF_TIP}-${HEDEF_YIL}.json`;

// SQL çıktı dosyası — D1'e DOĞRUDAN YAZILMAZ, sadece biriktirilir.
// D1'e yükleme manuel + insan onaylı (bkz. dosya başı yorum).
const SQL_DOSYA = `scripts/tkgm-analiz-data-${HEDEF_TIP}-${HEDEF_YIL}.sql`;
if (!KURU_CALIS && !existsSync(SQL_DOSYA)) {
  writeFileSync(SQL_DOSYA, `-- TKGM analiz verisi — tip=${HEDEF_TIP} yil=${HEDEF_YIL}\n-- D1'e yükle: cd backend/api && npx wrangler d1 execute cadastrum-db --remote --file=../../${SQL_DOSYA}\n\n`);
}

// ─── Yardımcılar ──────────────────────────────────────────────────────────────

const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

async function tkgmGet(url) {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (compatible; Cadastrum/1.0)",
      Origin: "https://parselsorgu.tkgm.gov.tr",
      Referer: "https://parselsorgu.tkgm.gov.tr/",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  return res.json();
}

function sqlYaz(sql) {
  if (KURU_CALIS) {
    console.log("[dry-run] SQL:", sql.slice(0, 120));
    return;
  }
  appendFileSync(SQL_DOSYA, sql.trim() + ";\n");
}

function batchInsert(noktalar, ilceKodu, analizTip, yil) {
  if (noktalar.length === 0) return;
  const seedAt = Date.now();
  // 500'lük batch'ler (D1 row limit)
  const BATCH = 400;
  for (let i = 0; i < noktalar.length; i += BATCH) {
    const slice = noktalar.slice(i, i + BATCH);
    const values = slice
      .map((n) => `(${ilceKodu},${analizTip},${yil},${n.parselId},${n.enlem},${n.boylam},${n.sayi},${seedAt})`)
      .join(",");
    sqlYaz(
      `INSERT OR IGNORE INTO tkgm_analiz_noktalari
         (ilce_kodu,analiz_tip,yil,parsel_id,enlem,boylam,sayi,seed_at)
       VALUES ${values}`
    );
  }
}

function ozetUpsert(ilceKodu, analizTip, yil, noktalar) {
  const noktaSayisi = noktalar.length;
  const toplamIslem = noktalar.reduce((s, n) => s + (n.sayi ?? 1), 0);
  const seedAt = Date.now();
  sqlYaz(
    `INSERT OR REPLACE INTO tkgm_analiz_ozet
       (ilce_kodu, analiz_tip, yil, nokta_sayisi, toplam_islem, seed_at)
     VALUES (${ilceKodu}, ${analizTip}, ${yil}, ${noktaSayisi}, ${toplamIslem}, ${seedAt})`
  );
}

// ─── İlerleme kayıt/yükle ─────────────────────────────────────────────────────

function ilerlemeYukle() {
  if (existsSync(ILERLEME_DOSYA)) {
    return JSON.parse(readFileSync(ILERLEME_DOSYA, "utf8"));
  }
  return { tamamlananIlceler: [] };
}

function ilerlemKaydet(ilceKodu, durum) {
  const kayit = ilerlemeYukle();
  if (!kayit.tamamlananIlceler.includes(ilceKodu)) {
    kayit.tamamlananIlceler.push(ilceKodu);
  }
  writeFileSync(ILERLEME_DOSYA, JSON.stringify(kayit, null, 2));
}

// ─── Ana akış ─────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n=== TKGM Analiz Seed ===`);
  console.log(`Tip: ${HEDEF_TIP} | Yıl: ${HEDEF_YIL} | IL: ${SADECE_IL ?? "tümü"}`);
  if (KURU_CALIS) console.log("⚠️  DRY-RUN modu — SQL dosyasına yazılmaz\n");
  else console.log(`SQL çıktı: ${SQL_DOSYA} (D1'e yükleme manuel)\n`);

  const ilerleme = ilerlemeYukle();
  const tamamlanan = new Set(ilerleme.tamamlananIlceler);

  // İl listesi al
  const ilKodlari = SADECE_IL
    ? [SADECE_IL]
    : Array.from({ length: 81 }, (_, i) => i + 1);

  let toplamIlce = 0;
  let toplamNokta = 0;
  let hataCount = 0;

  for (const ilKodu of ilKodlari) {
    // İlçe listesini çek
    let ilceler = [];
    try {
      const data = await tkgmGet(`${TKGM_IDARI_BASE}/ilceListe/${ilKodu}`);
      ilceler = (data.features ?? []).map((f) => ({
        ilceKodu: Number(f.properties?.id ?? 0),
        ilceAdi:  String(f.properties?.text ?? f.properties?.ad ?? ""),
      })).filter((x) => x.ilceKodu > 0);
    } catch (e) {
      console.error(`  ⚠️  İl ${ilKodu} ilçe listesi alınamadı: ${e.message}`);
      await bekle(HATA_BEKLEME_MS);
      continue;
    }

    console.log(`\n📍 İl ${ilKodu} — ${ilceler.length} ilçe`);

    for (const ilce of ilceler) {
      const key = `${ilce.ilceKodu}`;
      if (tamamlanan.has(ilce.ilceKodu)) {
        process.stdout.write(`  ⏭  ${ilce.ilceAdi} (${ilce.ilceKodu}) — atlandı\n`);
        continue;
      }

      let noktalar = [];
      let basarili = false;

      for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
        try {
          const url = `${TKGM_ANALIZ_BASE}?AnalizTip=${HEDEF_TIP}&Yil=${HEDEF_YIL}&IlceId=${ilce.ilceKodu}`;
          const data = await tkgmGet(url);
          noktalar = Array.isArray(data) ? data : [];
          basarili = true;
          break;
        } catch (e) {
          const msg = e.message;
          if (/403|limit|günlük/i.test(msg)) {
            console.error(`\n🛑 TKGM günlük limit! Yarın devam et. (${msg})`);
            process.exit(2);
          }
          console.error(`  ⚠️  Attempt ${attempt + 1}: ${msg}`);
          if (attempt < MAX_RETRY) await bekle(HATA_BEKLEME_MS);
        }
      }

      if (!basarili) {
        hataCount++;
        // Hata durumunda da "tamamlandı" işaretle — yarım veri girmeyi önle
        // Sonraki run'da başka tip/yıl için tekrar denenebilir
        process.stdout.write(`  ❌ ${ilce.ilceAdi} — ATLANIM (${hataCount}. hata)\n`);
        await bekle(ILCE_GECIKME_MS);
        continue;
      }

      // SQL dosyasına yaz
      batchInsert(noktalar, ilce.ilceKodu, HEDEF_TIP, HEDEF_YIL);
      ozetUpsert(ilce.ilceKodu, HEDEF_TIP, HEDEF_YIL, noktalar);
      ilerlemKaydet(ilce.ilceKodu);
      tamamlanan.add(ilce.ilceKodu);

      toplamIlce++;
      toplamNokta += noktalar.length;
      process.stdout.write(`  ✅ ${ilce.ilceAdi} (${ilce.ilceKodu}) — ${noktalar.length} nokta\n`);

      await bekle(ILCE_GECIKME_MS);
    }
  }

  console.log(`\n=== Tamamlandı ===`);
  console.log(`İlçe: ${toplamIlce} | Nokta: ${toplamNokta} | Hata: ${hataCount}`);
  if (hataCount > 0) {
    console.log(`⚠️  ${hataCount} ilçe atlandı — scripti tekrar çalıştırınca kaldığı yerden devam eder.`);
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
