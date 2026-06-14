/**
 * Baseline hesap çekirdeği — backtest + kalibrasyon + (ileride) baseline-engine ortak kaynağı.
 *
 * Saf aritmetik: chrome/async/DOM bağımlılığı yok, node'da koşar.
 * `ozellikCarpani` ve `bayesShrink` mantığı src/lib/baseline-engine.ts ile BİREBİR aynıdır;
 * tek fark katsayıların parametre olarak verilebilmesi (kalibrasyon için).
 *
 * DEFAULT_KATSAYILAR = engine'deki mevcut el-ayarlı değerler. Backtest bunları
 * "mevcut motor" olarak ölçer; kalibrasyon bunların üzerine arar.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

/**
 * Özellik çarpanı katsayıları — kademe sınırları (km) + her kademenin çarpanı.
 * baseline-engine.ts ozellikCarpani() ile aynı yapı. OZELLIK_ESIK değerleri buraya gömülü:
 *   sahilYakin=2, metroYakin=0.5, universiteYakin=1, anayolYakin=1, ilMerkezYakin=15
 */
export const DEFAULT_KATSAYILAR = {
  sahil: { cokYakinKm: 0.5, cokYakinX: 1.18, yakinKm: 2, yakinX: 1.10, bolgeKm: 5, bolgeX: 1.04 },
  metro: { yakinKm: 0.5, yakinX: 1.10, ortaKm: 1.5, ortaX: 1.04 },
  uni: { yakinKm: 1, yakinX: 1.05 },
  anayol: { yakinKm: 1, yakinX: 1.08, ortaKm: 3, ortaX: 1.03 },
  ilMerkez: { yakinKm: 15, yakinX: 1.12, ortaKm: 30, ortaX: 1.04, sapaKm: 60, sapaX: 0.92 },
  // Bayesian shrinkage gücü (KAPPA_BY_KATEGORI) — az emsalli mahalleyi ilçeye çeker.
  kappa: { arsa: 30, konut: 25, tarla: 45 },
};

/**
 * Mahalle özellik vektöründen fiyat çarpanı.
 * tuple = [sahilKm, metroKm, universiteKm, anayolKm, ilMerkezKm]; 0 = "uzak/yok".
 * @returns çarpan (0.85–1.40 arası tipik)
 */
export function ozellikCarpani(tuple, K = DEFAULT_KATSAYILAR) {
  if (!tuple) return 1.0;
  const [sahilKm, metroKm, uniKm, anayolKm, ilMerkezKm] = tuple;
  let c = 1.0;

  if (sahilKm > 0 && sahilKm <= K.sahil.cokYakinKm) c *= K.sahil.cokYakinX;
  else if (sahilKm > 0 && sahilKm <= K.sahil.yakinKm) c *= K.sahil.yakinX;
  else if (sahilKm > 0 && sahilKm <= K.sahil.bolgeKm) c *= K.sahil.bolgeX;

  if (metroKm > 0 && metroKm <= K.metro.yakinKm) c *= K.metro.yakinX;
  else if (metroKm > 0 && metroKm <= K.metro.ortaKm) c *= K.metro.ortaX;

  if (uniKm > 0 && uniKm <= K.uni.yakinKm) c *= K.uni.yakinX;

  if (anayolKm > 0 && anayolKm <= K.anayol.yakinKm) c *= K.anayol.yakinX;
  else if (anayolKm > 0 && anayolKm <= K.anayol.ortaKm) c *= K.anayol.ortaX;

  if (ilMerkezKm > 0 && ilMerkezKm <= K.ilMerkez.yakinKm) c *= K.ilMerkez.yakinX;
  else if (ilMerkezKm > 0 && ilMerkezKm <= K.ilMerkez.ortaKm) c *= K.ilMerkez.ortaX;
  else if (ilMerkezKm > K.ilMerkez.sapaKm) c *= K.ilMerkez.sapaX;

  return Math.round(c * 1000) / 1000;
}

/**
 * Bayesian shrinkage: az güvenli mahalle değerini ilçe ortalamasına çek.
 * alpha = guven / (guven + kappa). guven 0 → tamamen ilçe; yüksek → çoğunlukla mahalle.
 */
export function bayesShrink(mahalleTlm2, mahalleGuven, ilceTlm2, kappa) {
  if (!ilceTlm2) return mahalleTlm2;
  const alpha = mahalleGuven / (mahalleGuven + kappa);
  return alpha * mahalleTlm2 + (1 - alpha) * ilceTlm2;
}

// ── Yardımcılar ──

export function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** MAHALLE_OZELLIK'i .ts dosyasından parse et (export const ... = {...}). */
export function loadOzellik() {
  const metin = readFileSync(join(ROOT, "src/lib/data/mahalle-ozellik.ts"), "utf8");
  const bas = metin.indexOf("{", metin.indexOf("MAHALLE_OZELLIK"));
  let derinlik = 0, son = -1;
  for (let i = bas; i < metin.length; i++) {
    if (metin[i] === "{") derinlik++;
    else if (metin[i] === "}") { derinlik--; if (derinlik === 0) { son = i; break; } }
  }
  return JSON.parse(metin.slice(bas, son + 1));
}

/** Deterministik hash → [0,1) — seed'li train/test bölme için (Math.random yerine). */
export function hash01(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}
