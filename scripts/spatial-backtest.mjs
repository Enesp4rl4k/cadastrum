#!/usr/bin/env node
/**
 * Spatial IDW Backtest — koordinat-bazlı radius decay gerçekten çalışıyor mu?
 *
 *   node scripts/spatial-backtest.mjs
 *   node scripts/spatial-backtest.mjs --segment=arsa
 *   node scripts/spatial-backtest.mjs --radius=10000 --p=2
 *
 * Senaryo: "mahalle koordinatları + komşu mahalle fiyatları → IDW tahmin"
 *   Test mahallesi → komşu TRAIN mahallelerinden exp(-d/D) ağırlıklı medyan
 *   vs. mevcut ilçe-baseline yaklaşımı (backtest-rapor.json'daki ~58-62% MAPE)
 *
 * Veri kaynakları:
 *   data/mahalleler.json          — OSM mahalle merkez koordinatları
 *   data/mahalle-scrape-baseline.json — ground truth TL/m² (scrape'den)
 *   (yoksa scripts/emlakjet-data-*.sql'den otomatik türetilir)
 *
 * Çıktı: data/spatial-backtest-rapor.json + konsol özeti
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { median, hash01 } from "./baseline-cekirdek.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ── CLI Argümanlar ──
const args = process.argv.slice(2);
const getArg = (name, def) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split("=")[1] : def;
};
const SEGMENT    = getArg("segment", "arsa");   // arsa | tarla
const RADIUS_D   = Number(getArg("radius", "5000")); // metre — IDW D parametresi
const IDW_P      = Number(getArg("p", "2"));         // IDW üs (1 veya 2)
const TEST_ORANI = 0.20;
const MIN_ILAN   = 2;
const MIN_KOMSULAR = 2; // IDW tahmini için min komşu sayısı
const EPS        = 1e-6; // sıfır mesafe koruması

// ── Haversine (metre) ──
function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// ── exp(-d/D) ağırlığı (spatial-emsal.ts ile aynı formül) ──
function expWeight(d, D) {
  return Math.exp(-d / D);
}

// ── Ağırlıklı medyan (değer+ağırlık listesi) ──
function weightedMedian(items) {
  if (!items.length) return null;
  items.sort((a, b) => a.v - b.v);
  const totalW = items.reduce((s, x) => s + x.w, 0);
  let cumW = 0;
  for (const x of items) {
    cumW += x.w;
    if (cumW >= totalW / 2) return x.v;
  }
  return items[items.length - 1].v;
}

// ── Hata metrikleri ──
function olc(testler) {
  if (!testler.length) return { n: 0, mape: null, medyanApe: null, p90Ape: null, bias: null, within10: null, within20: null, within30: null };
  const apeler = [];
  let biasToplam = 0;
  for (const t of testler) {
    const ape = Math.abs(t.tahmin - t.gercek) / t.gercek;
    apeler.push(ape);
    biasToplam += (t.tahmin - t.gercek) / t.gercek;
  }
  apeler.sort((a, b) => a - b);
  const n = apeler.length;
  return {
    n,
    mape:      +(apeler.reduce((s, v) => s + v, 0) / n * 100).toFixed(2),
    medyanApe: +(apeler[Math.floor(n * 0.5)] * 100).toFixed(2),
    p90Ape:    +(apeler[Math.floor(n * 0.9)] * 100).toFixed(2),
    bias:      +((biasToplam / n) * 100).toFixed(2),
    within10:  +(apeler.filter((v) => v <= 0.10).length / n * 100).toFixed(1),
    within20:  +(apeler.filter((v) => v <= 0.20).length / n * 100).toFixed(1),
    within30:  +(apeler.filter((v) => v <= 0.30).length / n * 100).toFixed(1),
  };
}

// ── Veri Yükleme ──

/** data/mahalle-scrape-baseline.json veya SQL'den türet */
function groundTruthYukle() {
  const dosya = join(ROOT, "data/mahalle-scrape-baseline.json");
  if (existsSync(dosya)) return JSON.parse(readFileSync(dosya, "utf8"));

  // Yoksa backtest-baseline.mjs'nin mahalleBaselineFromHam() fallback'i
  // (SQL dosyası da yoksa boş obje döner, script uyarı verir)
  try {
    const { mahalleBaselineFromHam } = await import("./backtest-baseline.mjs");
    return mahalleBaselineFromHam();
  } catch {
    return {};
  }
}

/** data/mahalleler.json — OSM mahalle merkez koordinatları */
function koordinatlarYukle() {
  const dosya = join(ROOT, "data/mahalleler.json");
  if (!existsSync(dosya)) {
    console.error("❌  data/mahalleler.json bulunamadı. scripts/build-mahalle-merkez.mjs çalıştırın.");
    process.exit(1);
  }
  return JSON.parse(readFileSync(dosya, "utf8"));
}

// ── Ana Backtest Mantığı ──

/**
 * Ground truth key formatı: "il__ilce__mahalle" (küçük, normalize)
 * mahalleler.json formatı: { ilNorm, ilceNorm, mahalleNorm, lat, lng }
 * İki kaynağı anahtar üzerinden birleştir.
 */
function normKey(ilNorm, ilceNorm, mahalleNorm) {
  return `${ilNorm}__${ilceNorm}__${mahalleNorm}`;
}

function calistir() {
  console.log(`\n🗺️  Spatial IDW Backtest — segment=${SEGMENT} radius=${RADIUS_D}m p=${IDW_P}\n`);

  // 1. Ground truth yükle
  const gt = groundTruthYukle();
  const gtKeys = Object.keys(gt).filter((k) => {
    const s = gt[k][SEGMENT];
    return s && s.tlm2 > 0 && (s.ilanAdet ?? 0) >= MIN_ILAN;
  });

  if (!gtKeys.length) {
    console.error(`❌  Ground truth'ta ${SEGMENT} segmenti bulunamadı.`);
    console.error("    data/mahalle-scrape-baseline.json yoksa önce backtest-baseline.mjs çalıştırın.");
    process.exit(1);
  }

  // 2. Koordinat haritası oluştur — key → {lat, lng}
  const koordinatlar = koordinatlarYukle();
  const koordinatMap = {};
  for (const m of koordinatlar) {
    const k = normKey(m.ilNorm, m.ilceNorm, m.mahalleNorm);
    // Aynı key için birden fazla kayıt olabilir (OSM), ilkini al
    if (!koordinatMap[k]) koordinatMap[k] = { lat: m.lat, lng: m.lng };
  }

  // 3. Sadece koordinatı olan ground truth kayıtları
  const gecerliKeys = gtKeys.filter((k) => koordinatMap[k]);
  const koordinatsizSayi = gtKeys.length - gecerliKeys.length;
  console.log(`Ground truth: ${gtKeys.length} mahalle (${SEGMENT})`);
  console.log(`Koordinat eşleşen: ${gecerliKeys.length} | koordinatsız (atlandı): ${koordinatsizSayi}`);

  // 4. Deterministik train/test bölme
  const train = [], test = [];
  for (const k of gecerliKeys) {
    (hash01(`sp:${k}`) < TEST_ORANI ? test : train).push(k);
  }
  console.log(`Train: ${train.length} | Test: ${test.length}\n`);

  // 5. İlçe baseline (sadece train'den — sızıntı yok)
  const ilceBucket = {};
  for (const k of train) {
    const parca = k.split("__");
    const ilce = `${parca[0]}__${parca[1]}`;
    (ilceBucket[ilce] ||= []).push(gt[k][SEGMENT].tlm2);
  }
  const ilceMedyan = {};
  for (const [ilce, arr] of Object.entries(ilceBucket)) {
    if (arr.length >= 3) ilceMedyan[ilce] = median(arr);
  }

  // 6. Train koordinat + fiyat tablosu (IDW için)
  const trainVeri = train.map((k) => ({
    k,
    lat: koordinatMap[k].lat,
    lng: koordinatMap[k].lng,
    tlm2: gt[k][SEGMENT].tlm2,
  }));

  // 7. Her test mahallesi için IDW tahmini yap
  const sonuclar = [];
  let idwAtlanan = 0;

  for (const testKey of test) {
    const { lat, lng } = koordinatMap[testKey];
    const gercek = gt[testKey][SEGMENT].tlm2;
    const parca = testKey.split("__");
    const ilce = `${parca[0]}__${parca[1]}`;

    // İlçe tahmini (mevcut yaklaşım)
    const ilceTahmin = ilceMedyan[ilce] ?? null;

    // IDW: tüm train mahalleleri, sadece belirli bir max radius içindekiler
    const MAX_RADIUS = RADIUS_D * 4; // geniş bbox — sonra exp ağırlık düşürür
    const items = [];
    for (const tv of trainVeri) {
      const d = haversineM(lat, lng, tv.lat, tv.lng);
      if (d > MAX_RADIUS) continue;
      const w = expWeight(d + EPS, RADIUS_D); // exp(-d/D)
      items.push({ v: tv.tlm2, w, d });
    }

    // En az MIN_KOMSULAR komşu şartı
    if (items.length < MIN_KOMSULAR) {
      idwAtlanan++;
      // IDW yeterli veri yok → ilçe fallback ile kaydet (idw=null)
      if (ilceTahmin) {
        sonuclar.push({ testKey, gercek, ilceTahmin, idwTahmin: null, d_min: null });
      }
      continue;
    }

    const idwTahmin = weightedMedian(items);
    const dMin = Math.min(...items.map((x) => x.d));

    sonuclar.push({
      testKey,
      gercek,
      ilceTahmin: ilceTahmin ?? null,
      idwTahmin,
      d_min: Math.round(dMin),
      komsuSayi: items.length,
    });
  }

  // 8. Metrik hesaplama
  // IDW değerlendirmesi — sadece IDW tahmini olan örnekler
  const idwTestler    = sonuclar.filter((s) => s.idwTahmin != null);
  const ilceTestler   = sonuclar.filter((s) => s.ilceTahmin != null);
  // Ortak set — her iki tahmini de mevcut olanlar (adil karşılaştırma)
  const ortakTestler  = sonuclar.filter((s) => s.idwTahmin != null && s.ilceTahmin != null);

  const idwMetrik  = olc(idwTestler.map((s) => ({ tahmin: s.idwTahmin, gercek: s.gercek })));
  const ilceMetrik = olc(ilceTestler.map((s) => ({ tahmin: s.ilceTahmin, gercek: s.gercek })));
  const ilceOrtakMetrik = olc(ortakTestler.map((s) => ({ tahmin: s.ilceTahmin, gercek: s.gercek })));

  // 9. Yakınlık bandına göre IDW performansı (d < 1km, 1-5km, 5-15km)
  const bandlar = [
    { ad: "<1km",   min: 0,     max: 1000   },
    { ad: "1-5km",  min: 1000,  max: 5000   },
    { ad: "5-15km", min: 5000,  max: 15000  },
    { ad: ">15km",  min: 15000, max: Infinity },
  ];
  const bandMetrikleri = {};
  for (const b of bandlar) {
    const alt = idwTestler.filter((s) => s.d_min >= b.min && s.d_min < b.max);
    bandMetrikleri[b.ad] = { ...olc(alt.map((s) => ({ tahmin: s.idwTahmin, gercek: s.gercek }))), n: alt.length };
  }

  // 10. Özet rapor
  const rapor = {
    meta: {
      olusturulma: new Date().toISOString(),
      segment: SEGMENT,
      idwRadius_m: RADIUS_D,
      idwP: IDW_P,
      testOrani: TEST_ORANI,
      minIlan: MIN_ILAN,
      minKomsular: MIN_KOMSULAR,
    },
    veriOzeti: {
      groundTruthMahalle: gtKeys.length,
      koordinatEslesen: gecerliKeys.length,
      trainMahalle: train.length,
      testMahalle: test.length,
      idwAtlanan,
      idwDegerlendirildi: idwTestler.length,
      ortakKarsilastirma: ortakTestler.length,
    },
    karsilastirma: {
      idw:       idwMetrik,
      ilce:      ilceMetrik,
      ilceOrtak: ilceOrtakMetrik,   // aynı örnekler üzerinde ilçe — adil karşılaştırma
    },
    bandAnalizi: bandMetrikleri,
    sonuc: sonucCikar(idwMetrik, ilceOrtakMetrik),
  };

  // 11. Konsol özeti
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  ${SEGMENT.toUpperCase()} — Spatial IDW vs İlçe-Baseline Karşılaştırması`);
  console.log("═══════════════════════════════════════════════════════");
  console.log(`${"Metrik".padEnd(20)} ${"IDW".padStart(8)} ${"İlçe (ortak)".padStart(14)}`);
  console.log("─".repeat(44));
  const m = ["mape", "medyanApe", "within20", "within30", "bias"];
  const birim = { mape: "%", medyanApe: "%", within20: "%", within30: "%", bias: "%" };
  for (const key of m) {
    const idwV  = idwMetrik[key]      != null ? `${idwMetrik[key]}${birim[key]}` : "-";
    const ilcV  = ilceOrtakMetrik[key] != null ? `${ilceOrtakMetrik[key]}${birim[key]}` : "-";
    console.log(`  ${key.padEnd(18)} ${idwV.padStart(8)} ${ilcV.padStart(14)}`);
  }
  console.log("─".repeat(44));
  console.log(`  Örnek sayısı (n)   ${String(idwMetrik.n).padStart(8)} ${String(ilceOrtakMetrik.n).padStart(14)}`);
  console.log(`\n  IDW atlanan (yetersiz komşu): ${idwAtlanan}`);
  console.log("\n🔴 Yakınlık Band Analizi:");
  for (const [ad, bm] of Object.entries(bandMetrikleri)) {
    if (!bm.n) continue;
    console.log(`   ${ad.padEnd(8)}: n=${bm.n}  MAPE=${bm.mape ?? "-"}%  within20=${bm.within20 ?? "-"}%`);
  }
  console.log("\n📌 Sonuç:", rapor.sonuc.ozet);
  console.log("═══════════════════════════════════════════════════════\n");

  // 12. Dosyaya yaz
  const cikti = join(ROOT, "data/spatial-backtest-rapor.json");
  writeFileSync(cikti, JSON.stringify(rapor, null, 2), "utf8");
  console.log(`✅  Rapor yazıldı: ${cikti}\n`);
}

/** IDW vs ilçe karşılaştırmasından otomatik sonuç çıkar. */
function sonucCikar(idwM, ilceM) {
  if (!idwM.n || !ilceM.n) return { ozet: "Yetersiz veri — karşılaştırma yapılamadı." };

  const mapeFark = (ilceM.mape ?? 0) - (idwM.mape ?? 0); // pozitif = IDW daha iyi
  const w20Fark  = (idwM.within20 ?? 0) - (ilceM.within20 ?? 0);

  if (mapeFark > 5 && w20Fark > 0) {
    return { ozet: `IDW DAHA İYİ: MAPE ${mapeFark.toFixed(1)} puan düşük, within20 ${w20Fark.toFixed(1)} puan yüksek.`, karar: "spatial-aktif" };
  } else if (mapeFark > 0 && w20Fark >= 0) {
    return { ozet: `IDW hafif daha iyi: MAPE ${mapeFark.toFixed(1)} puan, within20 ${w20Fark.toFixed(1)} puan. Koordinat kalitesini iyileştirince faydalı olabilir.`, karar: "spatial-marjinal" };
  } else if (mapeFark < -5) {
    return { ozet: `İLÇE DAHA İYİ: IDW MAPE ${Math.abs(mapeFark).toFixed(1)} puan yüksek. Muhtemelen koordinat eşleştirme kalitesi düşük veya D parametresi yanlış.`, karar: "spatial-zayif" };
  } else {
    return { ozet: `Benzer performans (MAPE farkı ${mapeFark.toFixed(1)} puan). Spatial IDW ekstra değer sağlamıyor.`, karar: "spatial-esit" };
  }
}

// ── Hata düzeltmesi: groundTruthYukle async import kullanıyor, main'i async yap ──
async function main() {
  // groundTruthYukle senkron, sadece fallback async — basit try/catch yeterli
  const gt = groundTruthYukle();

  // gt boşsa erken çık
  if (!Object.keys(gt).length) {
    console.error("❌  Ground truth verisi yüklenemedi.");
    console.error("    data/mahalle-scrape-baseline.json oluşturmak için:");
    console.error("    node scripts/backtest-baseline.mjs çalıştırın.");
    process.exit(1);
  }
  calistir();
}

// groundTruthYukle'yi senkron versiyona indir (async import fallback'i kaldır, basitleştir)
function groundTruthYukle() {
  const dosya = join(ROOT, "data/mahalle-scrape-baseline.json");
  if (existsSync(dosya)) return JSON.parse(readFileSync(dosya, "utf8"));
  console.warn("⚠️   data/mahalle-scrape-baseline.json bulunamadı.");
  console.warn("    Boş obje ile devam ediliyor — node scripts/backtest-baseline.mjs ile oluşturun.");
  return {};
}

calistir();
