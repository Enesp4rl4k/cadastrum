#!/usr/bin/env node
/**
 * Güven kalibrasyon analizi — "bilmediğini bilmek".
 *
 *   node scripts/kalibrasyon-analiz.mjs
 *
 * Soru: Emsal havuzu ne kadar büyükse tahmin ne kadar isabetli? Bir bant (±%X)
 * gerçekte yüzde kaç vakayı kapsıyor? Bu, güven skorunun bant genişliğine DÜRÜST
 * eşlenmesi için ampirik temel verir (güven %80 gerçekten ~%80 kapsama mı?).
 *
 * Yöntem: tracked emlakjet SQL → mahalle-içi leave-one-out. Her çıkarılan ilan için
 * kalan medyandan bağıl hata e=|tahmin−gerçek|/gerçek. Emsal-sayısı kovalarına göre
 * kapsama eğrisi (±%10/20/30/50) + hedef %80 kapsama için gereken bant yarı-genişliği.
 *
 * Çıktı: konsol tablosu + data/kalibrasyon-rapor.json
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hamIlanlar } from "./backtest-baseline.mjs";
import { median } from "./baseline-cekirdek.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIN_ILAN = 5;                    // LOO için mahallede min ilan
const KOVALAR = [                      // emsal-sayısı kovaları (tahmini destekleyen havuz)
  { ad: "5–6", min: 5, max: 6 },
  { ad: "7–9", min: 7, max: 9 },
  { ad: "10–19", min: 10, max: 19 },
  { ad: "20+", min: 20, max: Infinity },
];
const BANTLAR = [0.10, 0.20, 0.30, 0.50];

function yuzdelik(sorted, p) {
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

/** Bir segment için LOO hatalarını (kova bilgisiyle) topla. */
function looHatalari(segment) {
  const gruplar = {};
  for (const il of hamIlanlar()) {
    if (il.kategori !== segment) continue;
    (gruplar[il.key] ||= []).push(il.tlm2);
  }
  const hatalar = []; // { e, k }
  for (const tlm2ler of Object.values(gruplar)) {
    if (tlm2ler.length < MIN_ILAN) continue;
    // IQR temizliği (gerçek piyasa gürültüsü kalsın, giriş hatası çıksın)
    const s = [...tlm2ler].sort((a, b) => a - b);
    const q1 = yuzdelik(s, 0.25), q3 = yuzdelik(s, 0.75), iqr = q3 - q1;
    const temiz = tlm2ler.filter((v) => v >= q1 - 1.5 * iqr && v <= q3 + 1.5 * iqr);
    if (temiz.length < MIN_ILAN) continue;
    const k = temiz.length - 1; // tahmini destekleyen (kalan) emsal sayısı
    for (let i = 0; i < temiz.length; i++) {
      const kalan = temiz.filter((_, j) => j !== i);
      const tahmin = median(kalan);
      hatalar.push({ e: Math.abs(tahmin - temiz[i]) / temiz[i], k });
    }
  }
  return hatalar;
}

function kovaMetrikleri(hatalar) {
  const out = [];
  for (const kova of KOVALAR) {
    const es = hatalar.filter((h) => h.k >= kova.min && h.k <= kova.max).map((h) => h.e).sort((a, b) => a - b);
    if (es.length < 20) { out.push({ kova: kova.ad, n: es.length, yetersiz: true }); continue; }
    const medyanApe = yuzdelik(es, 0.5);
    const kapsama = {};
    for (const b of BANTLAR) kapsama[b] = es.filter((e) => e <= b).length / es.length;
    // Hedef %80 kapsama için gereken bant yarı-genişliği (ampirik güven→bant eşlemesi)
    const bant80 = yuzdelik(es, 0.80);
    out.push({
      kova: kova.ad, n: es.length,
      medyanApeYuzde: +(medyanApe * 100).toFixed(1),
      kapsama20: +(kapsama[0.20] * 100).toFixed(1),
      kapsama30: +(kapsama[0.30] * 100).toFixed(1),
      kapsama50: +(kapsama[0.50] * 100).toFixed(1),
      bant80Yuzde: +(bant80 * 100).toFixed(1),
    });
  }
  return out;
}

function main() {
  const rapor = { tarih: new Date().toISOString(), aciklama: "Emsal-sayısı kovasına göre LOO kapsama kalibrasyonu", segmentler: {} };
  for (const seg of ["arsa", "tarla"]) {
    const hatalar = looHatalari(seg);
    const metrikler = kovaMetrikleri(hatalar);
    rapor.segmentler[seg] = { toplamOrnek: hatalar.length, kovalar: metrikler };

    console.log(`\n📊 ${seg.toUpperCase()} — güven kalibrasyonu (LOO, ${hatalar.length.toLocaleString("tr-TR")} örnek)`);
    console.log(`   ${"emsal".padEnd(7)} ${"n".padStart(6)}  ${"medyanAPE".padStart(9)}  ${"±20%".padStart(6)}  ${"±30%".padStart(6)}  ${"±50%".padStart(6)}  ${"→%80 için bant".padStart(14)}`);
    for (const m of metrikler) {
      if (m.yetersiz) { console.log(`   ${m.kova.padEnd(7)} ${String(m.n).padStart(6)}  (yetersiz örnek)`); continue; }
      console.log(`   ${m.kova.padEnd(7)} ${String(m.n).padStart(6)}  ${(m.medyanApeYuzde + "%").padStart(9)}  ${(m.kapsama20 + "%").padStart(6)}  ${(m.kapsama30 + "%").padStart(6)}  ${(m.kapsama50 + "%").padStart(6)}  ${("±" + m.bant80Yuzde + "%").padStart(14)}`);
    }
  }

  // Yorum: dürüst güven eşlemesi
  console.log(`\n💡 Yorum: "±%20 kapsama" sütunu = güven yüksek dediğimizde gerçek isabet.`);
  console.log(`   Emsal arttıkça kapsama artmalı → güven skoru emsal sayısıyla ölçeklenmeli.`);
  console.log(`   "→%80 için bant" = güveni %80 göstermek için bandın ampirik olması gereken yarı-genişliği.`);

  const yol = join(ROOT, "data/kalibrasyon-rapor.json");
  writeFileSync(yol, JSON.stringify(rapor, null, 2), "utf8");
  console.log(`\n✅ Rapor: data/kalibrasyon-rapor.json`);
}

main();
