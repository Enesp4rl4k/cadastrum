/**
 * Cross-validation framework — sistemin doğruluğunu nesnel ölç.
 *
 * Strateji: time-based split
 *   - Backend D1'deki `ilanlar` tablosundan son 90 gün veri
 *   - Eski %80 → train (mahalle medyan hesabı)
 *   - Yeni %20 → test (her ilan için tahmin = mahalle medyan, gerçek = ilan asking)
 *   - Per ilçe MAE/MAPE/RMSE hesabı
 *   - Bias detection: |MAPE| > 15% olan ilçelerde otomatik düzeltme çarpanı
 *
 * Endpoint:
 *   GET /v1/validation/rapor?secret=XXX → tam rapor JSON
 *   GET /v1/validation/bias?secret=XXX  → sadece bias tablosu (extension fetch)
 *   GET /v1/validation/public           → public summary (top issues)
 */

import { Hono } from "hono";
import type { Env } from "../index.js";

export const validationRoutes = new Hono<{ Bindings: Env }>();

interface IlanRow {
  il_norm: string;
  ilce_norm: string;
  mahalle_norm: string | null;
  fiyat_per_m2: number;
  kategori: string;
  yakalanma_tarihi: number;
}

interface IlceMetric {
  il_norm: string;
  ilce_norm: string;
  kategori: string;
  n: number;             // test sample size
  medyan_train: number;
  medyan_test: number;
  mae: number;           // mean absolute error
  mape: number;          // mean absolute percentage error (%)
  rmse: number;          // root mean square error
  bias: number;          // signed mean error (%) — negatif=düşük tahmin
  carpan: number;        // bias düzeltme çarpanı (1.0 + bias/100)
}

const PENCERE_GUN = 90;
const GUN_MS = 86_400_000;

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[mid]!;
}

async function calculateBiasReport(db: D1Database): Promise<{
  olusturuldu: number;
  pencereGun: number;
  toplamIlan: number;
  trainAdet: number;
  testAdet: number;
  global: { mape: number; mae: number; rmse: number; n: number };
  ilceler: IlceMetric[];
  topPositive: IlceMetric[];  // Sistem yüksek tahmin yapıyor (bias > 0)
  topNegative: IlceMetric[];  // Sistem düşük tahmin yapıyor (bias < 0)
}> {
  const minTarih = Date.now() - PENCERE_GUN * GUN_MS;

  // Tüm aktif ilanları çek
  const result = await db.prepare(
    `SELECT il_norm, ilce_norm, mahalle_norm, fiyat_per_m2, kategori, yakalanma_tarihi
     FROM ilanlar
     WHERE aktif = 1 AND yakalanma_tarihi >= ? AND fiyat_per_m2 > 0
     ORDER BY yakalanma_tarihi ASC`,
  ).bind(minTarih).all<IlanRow>();

  const tum = result.results ?? [];

  // Time-based split: ilk %80 train, son %20 test
  const cutIdx = Math.floor(tum.length * 0.8);
  const train = tum.slice(0, cutIdx);
  const test = tum.slice(cutIdx);

  // Train: ilçe × kategori için medyan hesap
  const trainGroups: Record<string, number[]> = {};
  for (const r of train) {
    const k = `${r.il_norm}|${r.ilce_norm}|${r.kategori}`;
    (trainGroups[k] ??= []).push(r.fiyat_per_m2);
  }

  // Test set için ilçe başı tahmin vs gerçek karşılaştırma
  const testGroups: Record<string, { tahminler: number[]; gercekler: number[] }> = {};
  for (const r of test) {
    const k = `${r.il_norm}|${r.ilce_norm}|${r.kategori}`;
    const trainList = trainGroups[k];
    if (!trainList || trainList.length < 3) continue; // yeterli train sample yok
    const tahmin = median(trainList);
    if (tahmin <= 0) continue;
    if (!testGroups[k]) testGroups[k] = { tahminler: [], gercekler: [] };
    testGroups[k].tahminler.push(tahmin);
    testGroups[k].gercekler.push(r.fiyat_per_m2);
  }

  // İlçe başı metric hesapla
  const ilceler: IlceMetric[] = [];
  let globalAbsErr = 0;
  let globalPctErr = 0;
  let globalSqErr = 0;
  let globalN = 0;

  for (const [k, grp] of Object.entries(testGroups)) {
    const [il_norm, ilce_norm, kategori] = k.split("|") as [string, string, string];
    if (grp.tahminler.length < 2) continue;

    let absErr = 0, pctErr = 0, sqErr = 0, signedPctErr = 0;
    for (let i = 0; i < grp.tahminler.length; i++) {
      const t = grp.tahminler[i]!;
      const g = grp.gercekler[i]!;
      const err = t - g; // pozitif = sistem yüksek tahmin (gerçek daha düşük)
      absErr += Math.abs(err);
      pctErr += Math.abs(err / g) * 100;
      signedPctErr += (err / g) * 100;
      sqErr += err * err;
    }
    const n = grp.tahminler.length;
    const trainList = trainGroups[k] ?? [];

    const mape = pctErr / n;
    const mae = absErr / n;
    const rmse = Math.sqrt(sqErr / n);
    const bias = signedPctErr / n;
    // Bias > 0: sistem yüksek tahmin → carpan < 1 (gerçeğe çek)
    // Bias < 0: sistem düşük → carpan > 1
    const carpan = Math.max(0.7, Math.min(1.3, 1 - bias / 100));

    ilceler.push({
      il_norm, ilce_norm, kategori, n,
      medyan_train: median(trainList),
      medyan_test: median(grp.gercekler),
      mae: Math.round(mae),
      mape: Math.round(mape * 10) / 10,
      rmse: Math.round(rmse),
      bias: Math.round(bias * 10) / 10,
      carpan: Math.round(carpan * 1000) / 1000,
    });

    globalAbsErr += absErr;
    globalPctErr += pctErr;
    globalSqErr += sqErr;
    globalN += n;
  }

  const globalMape = globalN > 0 ? Math.round((globalPctErr / globalN) * 10) / 10 : 0;
  const globalMae = globalN > 0 ? Math.round(globalAbsErr / globalN) : 0;
  const globalRmse = globalN > 0 ? Math.round(Math.sqrt(globalSqErr / globalN)) : 0;

  // Top sapan ilçeler (positif/negatif yüksek bias)
  const sortedByBias = [...ilceler].sort((a, b) => Math.abs(b.bias) - Math.abs(a.bias));
  const topPositive = sortedByBias.filter(x => x.bias > 0).slice(0, 10);
  const topNegative = sortedByBias.filter(x => x.bias < 0).slice(0, 10);

  return {
    olusturuldu: Date.now(),
    pencereGun: PENCERE_GUN,
    toplamIlan: tum.length,
    trainAdet: train.length,
    testAdet: test.length,
    global: { mape: globalMape, mae: globalMae, rmse: globalRmse, n: globalN },
    ilceler: ilceler.sort((a, b) => b.n - a.n), // sample sayısına göre
    topPositive,
    topNegative,
  };
}

// S1+S3: URL query param → Authorization header + timing-safe compare
validationRoutes.get("/rapor", async (c) => {
  const { bearerYetkilendir } = await import("../lib/security.js");
  const yetki = await bearerYetkilendir(c.req.header("Authorization"), c.env.SCRAPER_API_SECRET);
  if (!yetki) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const rapor = await calculateBiasReport(c.env.DB);
  return c.json(rapor);
});

// Public özet — extension/dashboard için (auth yok, sadece global metrikler)
validationRoutes.get("/public", async (c) => {
  const rapor = await calculateBiasReport(c.env.DB);
  c.header("Cache-Control", "public, s-maxage=3600");
  return c.json({
    olusturuldu: rapor.olusturuldu,
    pencereGun: rapor.pencereGun,
    toplamIlan: rapor.toplamIlan,
    trainAdet: rapor.trainAdet,
    testAdet: rapor.testAdet,
    global: rapor.global,
    topPositiveBias: rapor.topPositive.slice(0, 5).map(x => ({
      il: x.il_norm,
      ilce: x.ilce_norm,
      kategori: x.kategori,
      mape: x.mape,
      bias: x.bias,
      n: x.n,
    })),
    topNegativeBias: rapor.topNegative.slice(0, 5).map(x => ({
      il: x.il_norm,
      ilce: x.ilce_norm,
      kategori: x.kategori,
      mape: x.mape,
      bias: x.bias,
      n: x.n,
    })),
  });
});

// Bias tablosu — extension fetch (her ilçe için kalibrasyon çarpanı)
validationRoutes.get("/bias", async (c) => {
  const rapor = await calculateBiasReport(c.env.DB);
  // Sadece n >= 5 ve |MAPE| < 50% olan ilçeleri al (gürültü filtresi)
  const tablo: Record<string, number> = {};
  for (const x of rapor.ilceler) {
    if (x.n < 5) continue;
    if (x.mape > 50) continue;
    if (Math.abs(x.bias) < 5) continue; // küçük bias için düzeltme yapma
    tablo[`${x.il_norm}__${x.ilce_norm}__${x.kategori}`] = x.carpan;
  }
  c.header("Cache-Control", "public, s-maxage=86400"); // 24 saat
  return c.json({
    olusturuldu: rapor.olusturuldu,
    tabloAdet: Object.keys(tablo).length,
    bias: tablo,
  });
});
