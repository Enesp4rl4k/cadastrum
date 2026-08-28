/**
 * fiyat/index.ts — Fiyat motoru modüler barrel export.
 *
 * Kullanım:
 *   import { FiyatTahmini, fmtTL, fmtTLM2 } from "../lib/fiyat";
 *   import { fiyatTahminEt } from "../lib/fiyat-tahmin"; // ana fonksiyon hâlâ orada
 *
 * Geriye dönük uyumluluk korunur: fiyat-tahmin.ts bu modülleri re-export eder,
 * mevcut importlar değişmeden çalışmaya devam eder.
 */

export type { FiyatBileseni, FiyatTahmini, ImarSinifi } from "./types";
export { fmtTL, fmtTLM2, fmtTLKisa } from "./formatters";
export {
  IL_BASELINE_ARSA_TL_M2,
  IL_BASELINE_TARLA_TL_M2,
  FALLBACK_BASELINE_TL_M2,
  FALLBACK_TARLA_BASELINE_TL_M2,
} from "./constants";

// Veri Rafinerisi & Zaman Serisi Modülleri
export { ilanSanitizeEt, type RawIlanGirdisi, type SanitizedIlanSonuc, type HukukiKisitTipi } from "./data-sanitizer";
export { fiyatiBuguneTasi, ilanYasiGunHesapla, zamansalTazelikSkoru, formatTarihAy, type ZamanEndekslemeSonuc } from "./time-decay-engine";
export { emsalHavuzunuRafineEt, type RafineEmsal, type ElenenEmsal, type HavuzIstatistikleri, type RafinasyonSonucu } from "./outlier-engine";

