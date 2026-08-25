/**
 * Çoklu Ajan Mimarisi Tipleri & Ajan Protokolü.
 */

import type { FiyatTahmini } from "../fiyat-tahmin";
import type { DegerlemeKarari } from "../degerler/degerleme-ajani";
import type { MevzuatMaddesi } from "../rag/types";

export type AjanRolu =
  | "degerleme-uzmani"
  | "hukuk-imar-denetmeni"
  | "firsat-avcisi-scout"
  | "piyasa-istihbaratcisi";

export interface AjanMesaji {
  gonderen: AjanRolu;
  alici: AjanRolu | "orkestrator" | "kullanici";
  konu: string;
  icerik: string;
  veri?: Record<string, unknown>;
  zaman: number;
}

export interface ParselSorguGirdisi {
  il: string;
  ilce: string;
  mahalle?: string;
  kategori: "arsa" | "tarla" | "konut";
  alanM2: number;
  lat?: number;
  lng?: number;
  imarDurumu?: string;
  ilanFiyatiTL?: number;
  hisseliMi?: boolean;
  sitAlaniMi?: boolean;
  zeytinlikMi?: boolean;
  kiyiKenarM?: number;
}

export interface HukukDenetimRaporu {
  riskSeviyesi: "yuksek" | "orta" | "dusuk" | "temiz";
  riskSkoru: number; // 0-100 (100 = çok yüksek risk)
  tespitEdilenRiskler: Array<{
    baslik: string;
    aciklama: string;
    ilgiliKanun: string;
    oneri: string;
  }>;
  ilgiliMevzuat: MevzuatMaddesi[];
  ozetHukukiGorus: string;
}

export interface FirsatAnalizRaporu {
  kelepirMi: boolean;
  iskontoOraniYuzde: number; // Piyasa değerine göre % kaç ucuz
  tahminiPiyasaDegeriTL: number;
  ilanFiyatiTL?: number;
  firsatPuani: number; // 0-100
  potansiyelKarTL: number;
  firsatGerekcesi: string;
  riskFaktorleri: string[];
}

export interface CokluAjanSentezRaporu {
  parselBilgisi: ParselSorguGirdisi;
  degerleme?: DegerlemeKarari | FiyatTahmini;
  hukuk: HukukDenetimRaporu;
  firsat: FirsatAnalizRaporu;
  genelKarar: "guclu-al" | "al" | "tut-incele" | "uzak-dur";
  nihaiTavsiye: string;
  ajanLoglari: AjanMesaji[];
}