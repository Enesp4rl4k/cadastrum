/** Tipler — `scripts/gercek-satis-olcum.mjs` için (testler TypeScript'ten import ediyor). */

export declare const KARAR_KURALI: Readonly<{ MIN_N: number; ANLAMLI_FARK_PUAN: number }>;
export declare const KATMAN_MIN_N: number;

export interface Metrik {
  n: number;
  medyanApe: number | null;
  within10: number | null;
  within20: number | null;
  medyanSapma: number | null;
}

export interface GercekSatisSatiri {
  kategori: string;
  tip: string;
  gercek_per_m2: number;
  heuristic_per_m2: number | null;
  baseline_kaynak: string | null;
  uygulanan_indirim: number | null;
}

export interface KategoriOlcumu {
  islemHedefli: Metrik;
  iskontoTesti: { iskontolu: Metrik; ilanEsdegeri: Metrik };
  katmanlar: Record<string, Metrik>;
  gosterilmeyenKatman: number;
}

export type KararDurumu = "YETERSIZ" | "REFERANS_YOK" | "VEKIL_IYI" | "HEDEF_DEGISMELI";

export declare function metrik(ciftler: Array<{ tahmin: number; gercek: number }>): Metrik;
export declare function olcumYap(satirlar: GercekSatisSatiri[]): Record<"arsa" | "tarla", KategoriOlcumu>;
export declare function karar(
  islem: Metrik | null,
  referansWithin20: number | null,
): { durum: KararDurumu; fark?: number; gerekce: string };
