#!/usr/bin/env node
/**
 * Katsayı kalibrasyonu — özellik çarpanlarını GERÇEK veriden türetir.
 *
 *   node scripts/kalibrasyon.mjs
 *
 * Yöntem (grid search değil, veriden-türetme — daha prensipli ve yorumlanabilir):
 *   1. Her train mahallesi için r = gerçek / ilçeTahmin  ("gerçek çarpan")
 *   2. Baz çarpan = tüm train'in medyan r'si → ilçe→mahalle sistematik kayması
 *      (backtest köy iskontosunu burada yakalar; bias'ın çoğunu düzeltir)
 *   3. Her feature kademesi için: o kademeye düşen mahallelerin medyan (r / baz)'ı
 *      → o kademenin marjinal çarpanı
 *   4. Test setinde uygula, DEFAULT katsayılarla MAPE/medyan-APE kıyasla
 *
 * Çıktı: data/kalibre-katsayilar.json (sadece test-medyan-APE iyileşirse anlamlı).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hazirla } from "./backtest-baseline.mjs";
import { ozellikCarpani, median, loadOzellik, hash01, DEFAULT_KATSAYILAR } from "./baseline-cekirdek.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const MIN_GRUP = 15; // bir kademe çarpanı türetmek için min mahalle (gürültü guard)

/** Bir tuple'ın hangi kademelere düştüğünü etiketle (DEFAULT eşiklerini referans alır). */
function kademeler(tuple, K) {
  if (!tuple) return [];
  const [sahil, metro, uni, anayol, ilM] = tuple;
  const e = [];
  if (sahil > 0 && sahil <= K.sahil.cokYakinKm) e.push("sahil_cokYakin");
  else if (sahil > 0 && sahil <= K.sahil.yakinKm) e.push("sahil_yakin");
  else if (sahil > 0 && sahil <= K.sahil.bolgeKm) e.push("sahil_bolge");
  if (metro > 0 && metro <= K.metro.yakinKm) e.push("metro_yakin");
  else if (metro > 0 && metro <= K.metro.ortaKm) e.push("metro_orta");
  if (uni > 0 && uni <= K.uni.yakinKm) e.push("uni_yakin");
  if (anayol > 0 && anayol <= K.anayol.yakinKm) e.push("anayol_yakin");
  else if (anayol > 0 && anayol <= K.anayol.ortaKm) e.push("anayol_orta");
  if (ilM > 0 && ilM <= K.ilMerkez.yakinKm) e.push("ilMerkez_yakin");
  else if (ilM > 0 && ilM <= K.ilMerkez.ortaKm) e.push("ilMerkez_orta");
  else if (ilM > K.ilMerkez.sapaKm) e.push("ilMerkez_sapa");
  return e;
}

/** Türetilen baz+kademe çarpanlarını DEFAULT_KATSAYILAR şemasına geri yaz. */
function katsayiUret(baz, kademeCarpan) {
  const K = structuredClone(DEFAULT_KATSAYILAR);
  const g = (ad, fb) => kademeCarpan[ad] ?? fb;
  K.baz = +baz.toFixed(3);
  K.sahil = { cokYakinKm: 0.5, cokYakinX: g("sahil_cokYakin", 1.18), yakinKm: 2, yakinX: g("sahil_yakin", 1.10), bolgeKm: 5, bolgeX: g("sahil_bolge", 1.04) };
  K.metro = { yakinKm: 0.5, yakinX: g("metro_yakin", 1.10), ortaKm: 1.5, ortaX: g("metro_orta", 1.04) };
  K.uni = { yakinKm: 1, yakinX: g("uni_yakin", 1.05) };
  K.anayol = { yakinKm: 1, yakinX: g("anayol_yakin", 1.08), ortaKm: 3, ortaX: g("anayol_orta", 1.03) };
  K.ilMerkez = { yakinKm: 15, yakinX: g("ilMerkez_yakin", 1.12), ortaKm: 30, ortaX: g("ilMerkez_orta", 1.04), sapaKm: 60, sapaX: g("ilMerkez_sapa", 0.92) };
  return K;
}

/** Metrik (backtest ile aynı tanım). */
function olc(testler, tahminFn) {
  const apeler = testler.map((t) => Math.abs(tahminFn(t) - t.gercek) / t.gercek).sort((a, b) => a - b);
  const n = apeler.length;
  const biasArr = testler.map((t) => (tahminFn(t) - t.gercek) / t.gercek);
  return {
    n,
    mape: +((apeler.reduce((s, v) => s + v, 0) / n) * 100).toFixed(2),
    medyanApe: +(apeler[Math.floor(n * 0.5)] * 100).toFixed(2),
    within20: +((apeler.filter((v) => v <= 0.20).length / n) * 100).toFixed(1),
    bias: +((biasArr.reduce((s, v) => s + v, 0) / n) * 100).toFixed(2),
  };
}

function kalibreSegment(segment, ozellikMap) {
  const { testler } = hazirla(segment, ozellikMap);
  if (testler.length < 50) return { segment, yetersiz: true, n: testler.length };

  // Ratio'ları SADECE train'den türet (test sızdırılmaz) — hazirla() ile aynı deterministik bölme.
  const tumKayit = trainKayitlari(segment, ozellikMap);

  // 1. Baz çarpan = train medyan(gerçek/ilçe)
  const bazRatios = tumKayit.map((t) => t.gercek / t.ilceTahmin);
  const baz = median(bazRatios);

  // 2. Kademe marjinal çarpanları = medyan( (gerçek/ilçe) / baz ) o kademedeki train mahalleleri
  const kademeBucket = {};
  for (const t of tumKayit) {
    const r = (t.gercek / t.ilceTahmin) / baz;
    for (const kad of kademeler(t.ozellik, DEFAULT_KATSAYILAR)) (kademeBucket[kad] ||= []).push(r);
  }
  const kademeCarpan = {};
  for (const [kad, arr] of Object.entries(kademeBucket)) {
    if (arr.length >= MIN_GRUP) kademeCarpan[kad] = +median(arr).toFixed(3);
  }

  const K = katsayiUret(baz, kademeCarpan);

  // 3. Test'te kıyas: DEFAULT vs kalibre
  const def = olc(testler, (t) => t.ilceTahmin * ozellikCarpani(t.ozellik, DEFAULT_KATSAYILAR));
  const kal = olc(testler, (t) => t.ilceTahmin * baz * ozellikCarpani(t.ozellik, K) / 1.0);
  // Not: kalibre tahmin = ilçe × baz × kademeÇarpanları. ozellikCarpani(K) baz'ı içermez,
  // kademe çarpanlarını uygular; baz ayrı çarpılır.

  return { segment, n: testler.length, baz: +baz.toFixed(3), kademeCarpan, K, def, kal };
}

/** Train kayıtları — backtest.hazirla()'nın train tarafı (aynı seed/eşikler → sızıntısız). */
function trainKayitlari(segment, ozellikMap) {
  const mahalleBaseline = JSON.parse(readFileSync(join(ROOT, "data/mahalle-scrape-baseline.json"), "utf8"));
  const kayitlar = [];
  for (const [key, segs] of Object.entries(mahalleBaseline)) {
    const s = segs[segment];
    if (!s || !s.tlm2 || s.tlm2 <= 0 || (s.ilanAdet ?? 0) < 2) continue;
    const p = key.split("__");
    if (p.length < 3) continue;
    kayitlar.push({ key, il_ilce: `${p[0]}__${p[1]}`, tlm2: s.tlm2 });
  }
  const train = [], test = [];
  for (const k of kayitlar) (hash01(`bt:${k.key}`) < 0.20 ? test : train).push(k);
  const ilceBucket = {};
  for (const k of train) (ilceBucket[k.il_ilce] ||= []).push(k.tlm2);
  const ilceMedyan = {};
  for (const [ilce, arr] of Object.entries(ilceBucket)) if (arr.length >= 3) ilceMedyan[ilce] = median(arr);
  const out = [];
  for (const k of train) {
    const ilceTahmin = ilceMedyan[k.il_ilce];
    if (!ilceTahmin) continue;
    out.push({ key: k.key, gercek: k.tlm2, ilceTahmin, ozellik: ozellikMap[k.key] ?? null });
  }
  return out;
}

function main() {
  const ozellikMap = loadOzellik();
  const sonuc = { tarih: new Date().toISOString(), yontem: "veriden-turetme (median ratio)", segmentler: {} };

  for (const segment of ["tarla", "arsa"]) {
    const r = kalibreSegment(segment, ozellikMap);
    if (r.yetersiz) { console.log(`[${segment}] yetersiz test (${r.n}) — atlandı.\n`); continue; }
    sonuc.segmentler[segment] = { baz: r.baz, kademeCarpan: r.kademeCarpan, katsayilar: r.K, def: r.def, kal: r.kal };

    const dMape = (r.def.mape - r.kal.mape).toFixed(2);
    const dMed = (r.def.medyanApe - r.kal.medyanApe).toFixed(2);
    console.log(`🎯 ${segment.toUpperCase()}  (${r.n} test)`);
    console.log(`   Baz çarpan (ilçe→mahalle kayması): ×${r.baz}  ${r.baz < 1 ? `(köy iskontosu −%${Math.round((1 - r.baz) * 100)})` : `(+%${Math.round((r.baz - 1) * 100)})`}`);
    console.log(`   DEFAULT  : MAPE %${r.def.mape} | medyan %${r.def.medyanApe} | ±20 ${r.def.within20}% | bias %${r.def.bias}`);
    console.log(`   KALİBRE  : MAPE %${r.kal.mape} | medyan %${r.kal.medyanApe} | ±20 ${r.kal.within20}% | bias %${r.kal.bias}`);
    console.log(`   → MAPE ${dMape > 0 ? "−" : "+"}%${Math.abs(dMape)} · medyan ${dMed > 0 ? "−" : "+"}%${Math.abs(dMed)}  ${dMed > 0 ? "✅ iyileşti" : "❌ iyileşmedi"}`);
    const ilginc = Object.entries(r.kademeCarpan).filter(([, v]) => Math.abs(v - 1) > 0.05);
    if (ilginc.length) console.log(`   Anlamlı kademeler: ${ilginc.map(([k, v]) => `${k}×${v}`).join(", ")}`);
    console.log();
  }

  writeFileSync(join(ROOT, "data/kalibre-katsayilar.json"), JSON.stringify(sonuc, null, 2), "utf8");
  console.log("✅ data/kalibre-katsayilar.json");
}

main();
