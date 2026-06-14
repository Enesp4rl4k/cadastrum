#!/usr/bin/env node
/**
 * Backtest harness — fiyat tahmin çekirdeğinin hold-out hatasını ölçer.
 *
 *   node scripts/backtest-baseline.mjs
 *   node scripts/backtest-baseline.mjs --katsayi=data/kalibre-katsayilar.json
 *
 * Senaryo: "mahalle verisi YOKKEN ilçe + özellik çarpanı gerçek mahalle medyanını
 * ne kadar iyi tahmin ediyor?" — extension'da en sık durum (cold start).
 *
 * Ground truth: data/mahalle-scrape-baseline.json (gerçek ilan medyanları).
 * İlçe tahmini SADECE train mahallelerinden hesaplanır (test mahallesi sızdırılmaz).
 *
 * Çıktı: data/backtest-rapor.json + konsol özeti.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ozellikCarpani, median, loadOzellik, hash01, DEFAULT_KATSAYILAR } from "./baseline-cekirdek.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const args = process.argv.slice(2);
const katsayiArg = args.find((a) => a.startsWith("--katsayi="))?.split("=")[1];
const KATSAYILAR = katsayiArg && existsSync(join(ROOT, katsayiArg))
  ? JSON.parse(readFileSync(join(ROOT, katsayiArg), "utf8")).katsayilar ?? JSON.parse(readFileSync(join(ROOT, katsayiArg), "utf8"))
  : DEFAULT_KATSAYILAR;

const TEST_ORANI = 0.20;      // hold-out test payı
const MIN_ILAN = 2;           // ground truth güveni için min ilan adedi
const MIN_ILCE_TRAIN = 3;     // ilçe tahmini için min train mahalle sayısı

/**
 * Test setini ve train-ilçe-medyanlarını üret.
 * @returns { testler: [{key, il_ilce, segment, gercek, ozellik}], ilceMedyan: Map }
 */
export function hazirla(segment, ozellikMap) {
  const mahalleBaseline = JSON.parse(readFileSync(join(ROOT, "data/mahalle-scrape-baseline.json"), "utf8"));

  // Geçerli kayıtlar: bu segmentte yeterli ilanı olan mahalleler
  const kayitlar = [];
  for (const [key, segs] of Object.entries(mahalleBaseline)) {
    const s = segs[segment];
    if (!s || !s.tlm2 || s.tlm2 <= 0) continue;
    if ((s.ilanAdet ?? 0) < MIN_ILAN) continue;
    const parca = key.split("__");
    if (parca.length < 3) continue;
    kayitlar.push({ key, il_ilce: `${parca[0]}__${parca[1]}`, tlm2: s.tlm2 });
  }

  // Deterministik train/test bölme (seed'li hash)
  const train = [], test = [];
  for (const k of kayitlar) {
    (hash01(`bt:${k.key}`) < TEST_ORANI ? test : train).push(k);
  }

  // İlçe medyanı SADECE train'den (sızıntı yok)
  const ilceBucket = {};
  for (const k of train) (ilceBucket[k.il_ilce] ||= []).push(k.tlm2);
  const ilceMedyan = {};
  for (const [ilce, arr] of Object.entries(ilceBucket)) {
    if (arr.length >= MIN_ILCE_TRAIN) ilceMedyan[ilce] = median(arr);
  }

  // Test kayıtları (ilçe tahmini olanlar)
  const testler = [];
  for (const k of test) {
    const ilceTahmin = ilceMedyan[k.il_ilce];
    if (!ilceTahmin) continue; // ilçede yeterli train verisi yok → değerlendiremeyiz
    testler.push({
      key: k.key,
      gercek: k.tlm2,
      ilceTahmin,
      ozellik: ozellikMap[k.key] ?? null,
      koy: !ozellikMap[k.key] || (ozellikMap[k.key][1] === 0 && ozellikMap[k.key][2] === 0), // metro+üni yok ≈ köy
    });
  }
  return { testler, trainSayi: train.length };
}

/** Bir test seti için hata metrikleri. tahminFn(t) → tahmin TL/m². */
function olc(testler, tahminFn) {
  const apeler = [];
  let biasToplam = 0;
  for (const t of testler) {
    const tahmin = tahminFn(t);
    const ape = Math.abs(tahmin - t.gercek) / t.gercek;
    apeler.push(ape);
    biasToplam += (tahmin - t.gercek) / t.gercek;
  }
  apeler.sort((a, b) => a - b);
  const n = apeler.length;
  const mape = apeler.reduce((s, v) => s + v, 0) / n;
  const medyanApe = apeler[Math.floor(n * 0.5)];
  const p90 = apeler[Math.floor(n * 0.9)];
  const within10 = apeler.filter((v) => v <= 0.10).length / n;
  const within20 = apeler.filter((v) => v <= 0.20).length / n;
  return {
    n,
    mape: +(mape * 100).toFixed(2),
    medyanApe: +(medyanApe * 100).toFixed(2),
    p90Ape: +(p90 * 100).toFixed(2),
    bias: +((biasToplam / n) * 100).toFixed(2),
    within10: +(within10 * 100).toFixed(1),
    within20: +(within20 * 100).toFixed(1),
  };
}

/** Dışarıdan (kalibrasyon) çağrılabilir: verilen katsayılarla test-MAPE döndür. */
export function backtest(segment, ozellikMap, katsayilar) {
  const { testler } = hazirla(segment, ozellikMap);
  const ozellikli = olc(testler, (t) => t.ilceTahmin * ozellikCarpani(t.ozellik, katsayilar));
  const duz = olc(testler, (t) => t.ilceTahmin); // çarpansız referans
  return { testler, ozellikli, duz };
}

// ── 2. KATMAN: mahalle-içi leave-one-out ──
// "Mahallede gerçek veri varken bir parseli ne kadar iyi tahmin ederiz?"
// Ham ilanları çek, mahalle-içinde her ilanı çıkar, kalanların medyanı vs çıkarılan ilan.
// Bu üst-sınır hatadır: parsel faktörlerini (imar/m2/cephe) İÇERİR — extension bunları
// ayrıca düzeltir, yani gerçek extension hatası bundan DAHA İYİdir.

const SQL_DOSYALAR = [
  join(ROOT, "scripts/emlakjet-data-turkiye.sql"),
  join(ROOT, "scripts/emlakjet-data-full.sql"),
].filter((p) => existsSync(p));

function yuzdelik(arr, p) {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) * p)];
}

/** SQL'den ham ilanları (mahalle + segment + tlm2 + m2) parse et. */
function hamIlanlar() {
  const re = /'(?:emlakjet|extension)','ej_[^']+','([^']*)','([^']*)',([^,]+),(\d+),(\d+),'([^']+)'/g;
  const out = [];
  for (const p of SQL_DOSYALAR) {
    const metin = readFileSync(p, "utf8");
    let m;
    while ((m = re.exec(metin)) !== null) {
      const mah = m[3].trim();
      if (mah === "NULL") continue;
      const tlm2 = parseInt(m[4], 10), m2 = parseInt(m[5], 10);
      if (tlm2 < 100 || tlm2 > 5_000_000 || m2 < 50) continue;
      out.push({ key: `${m[1]}__${m[2]}__${mah.replace(/^'|'$/g, "")}`, tlm2, m2, kategori: m[6] });
    }
  }
  return out;
}

/** Mahalle-içi leave-one-out hata. minIlan: LOO için min ilan (≥4 anlamlı). */
export function mahalleIciLOO(segment, minIlan = 4) {
  const gruplar = {};
  for (const il of hamIlanlar()) {
    if (il.kategori !== segment) continue;
    (gruplar[il.key] ||= []).push(il);
  }
  const apeler = [];
  let mahalleSayi = 0, ilanSayi = 0;
  for (const ilanlar of Object.values(gruplar)) {
    if (ilanlar.length < minIlan) continue;
    // IQR filtre — hatalı giriş outlier'larını at (gerçek piyasa gürültüsü kalsın)
    const tlm2ler = ilanlar.map((i) => i.tlm2);
    const q1 = yuzdelik(tlm2ler, 0.25), q3 = yuzdelik(tlm2ler, 0.75), iqr = q3 - q1;
    const temiz = ilanlar.filter((i) => i.tlm2 >= q1 - 1.5 * iqr && i.tlm2 <= q3 + 1.5 * iqr);
    if (temiz.length < minIlan) continue;
    mahalleSayi++;
    for (let i = 0; i < temiz.length; i++) {
      const kalan = temiz.filter((_, j) => j !== i).map((x) => x.tlm2);
      const tahmin = median(kalan);
      apeler.push(Math.abs(tahmin - temiz[i].tlm2) / temiz[i].tlm2);
      ilanSayi++;
    }
  }
  apeler.sort((a, b) => a - b);
  const n = apeler.length;
  if (n === 0) return null;
  return {
    mahalleSayi, ilanSayi: n,
    mape: +((apeler.reduce((s, v) => s + v, 0) / n) * 100).toFixed(2),
    medyanApe: +(apeler[Math.floor(n * 0.5)] * 100).toFixed(2),
    within10: +((apeler.filter((v) => v <= 0.10).length / n) * 100).toFixed(1),
    within20: +((apeler.filter((v) => v <= 0.20).length / n) * 100).toFixed(1),
  };
}

function main() {
  const ozellikMap = loadOzellik();
  console.log(`Özellik vektörü: ${Object.keys(ozellikMap).length.toLocaleString("tr-TR")} mahalle`);
  console.log(`Katsayı kaynağı: ${katsayiArg ?? "DEFAULT (mevcut motor)"}\n`);

  const rapor = { tarih: new Date().toISOString(), katsayiKaynagi: katsayiArg ?? "default", segmentler: {} };

  for (const segment of ["arsa", "tarla"]) {
    const { testler, ozellikli, duz } = backtest(segment, ozellikMap, KATSAYILAR);
    if (testler.length === 0) { console.log(`[${segment}] test verisi yok, atlandı.`); continue; }

    // Köy vs şehir kırılımı (özellikli model)
    const koyT = testler.filter((t) => t.koy);
    const sehirT = testler.filter((t) => !t.koy);
    const koy = koyT.length ? olc(koyT, (t) => t.ilceTahmin * ozellikCarpani(t.ozellik, KATSAYILAR)) : null;
    const sehir = sehirT.length ? olc(sehirT, (t) => t.ilceTahmin * ozellikCarpani(t.ozellik, KATSAYILAR)) : null;

    rapor.segmentler[segment] = { ozellikli, duz, koy, sehir };

    const delta = (duz.mape - ozellikli.mape).toFixed(2);
    console.log(`📊 ${segment.toUpperCase()}  (${testler.length} test mahallesi)`);
    console.log(`   Düz ilçe tahmini    MAPE %${duz.mape}  | medyan %${duz.medyanApe} | ±%20 içinde ${duz.within20}%`);
    console.log(`   + Özellik çarpanı   MAPE %${ozellikli.mape}  | medyan %${ozellikli.medyanApe} | ±%20 içinde ${ozellikli.within20}%`);
    console.log(`   → Özellik çarpanı katkısı: ${delta > 0 ? "−" : "+"}%${Math.abs(delta)} MAPE (${delta > 0 ? "iyileştirdi" : "kötüleştirdi"})`);
    if (koy && sehir) console.log(`   Köy MAPE %${koy.mape} (${koy.n}) · Şehir MAPE %${sehir.mape} (${sehir.n})`);
    console.log(`   Bias: %${ozellikli.bias} (${ozellikli.bias > 0 ? "yüksek tahmin eğilimi" : "düşük tahmin eğilimi"})\n`);
  }

  // ── 2. katman: mahalle-içi LOO ──
  console.log("─".repeat(60));
  console.log("2. KATMAN — mahallede gerçek veri varken (leave-one-out):\n");
  rapor.mahalleIci = {};
  for (const segment of ["arsa", "tarla"]) {
    const r = mahalleIciLOO(segment);
    if (!r) { console.log(`[${segment}] yeterli çok-ilanlı mahalle yok.`); continue; }
    rapor.mahalleIci[segment] = r;
    console.log(`🏘️  ${segment.toUpperCase()}  (${r.mahalleSayi} mahalle, ${r.ilanSayi} ilan LOO)`);
    console.log(`   medyan APE %${r.medyanApe} | MAPE %${r.mape} | ±%10 içinde ${r.within10}% | ±%20 içinde ${r.within20}%\n`);
  }

  const cikti = join(ROOT, "data/backtest-rapor.json");
  writeFileSync(cikti, JSON.stringify(rapor, null, 2), "utf8");
  console.log(`✅ Rapor: data/backtest-rapor.json`);
}

// Sadece doğrudan çalıştırılınca main() (import edilince değil)
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("backtest-baseline.mjs")) {
  main();
}
