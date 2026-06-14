/**
 * Kira getirisi tahmini — Faz 3 Sprint E.
 *
 * Şu an: statik baseline (il bazlı ortalama kira TL/m²/ay).
 * Sprint G'de backend `/v1/fiyat/kira/mahalle` ile mahalle bazlı gerçek
 * Sahibinden kiralık ortalaması döner.
 *
 * Sadece konut kategori için anlam taşır; arsa/tarla için null.
 */

import type { Parsel } from "../types/tkgm";
import { normalizeYerAdi } from "./tkgm-api";

/**
 * İl bazlı konut kira ortalaması (TL/m²/ay).
 * Kaynak: Endeksa + Hepsiemlak Aralık 2025 ortalama (kabaca).
 * Sprint G ile backend'den gerçek mahalle bazlı değer çekilecek.
 */
const IL_KIRA_TLM2_AY: Record<string, number> = {
  "istanbul": 350,
  "ankara": 180,
  "izmir": 250,
  "antalya": 220,
  "bursa": 160,
  "mugla": 280,
  "kocaeli": 175,
  "aydin": 165,
  "balikesir": 130,
  "tekirdag": 145,
  "konya": 110,
  "kayseri": 105,
  "gaziantep": 120,
  "samsun": 110,
  "trabzon": 140,
  "eskisehir": 130,
  "denizli": 115,
};
const IL_KIRA_FALLBACK = 100;

function konutMu(nitelik: string): boolean {
  const t = nitelik.toLocaleLowerCase("tr");
  return /mesken|bina|işyeri|isyeri|konut|daire|villa/.test(t);
}

export interface KiraTahmini {
  /** Aylık kira (TL) */
  aylikKira: number;
  /** Yıllık kira (TL) — aylık × 12 */
  yillikKira: number;
  /** Kullanılan birim kira (TL/m²/ay) */
  birimKira: number;
  /** Kaynak — statik il baseline */
  kaynak: "statik-il";
  /** Açıklama */
  not: string;
}

/**
 * Parsel için kira tahmini.
 * Konut dışı (arsa/tarla) için null döner.
 */
export function kiraTahminiHesapla(parsel: Parsel): KiraTahmini | null {
  if (!konutMu(parsel.nitelik)) return null;
  if (!parsel.alan || parsel.alan <= 0) return null;

  const ilNorm = parsel.ilAd ? normalizeYerAdi(parsel.ilAd) : "";
  const birimKira = IL_KIRA_TLM2_AY[ilNorm] ?? IL_KIRA_FALLBACK;
  // Bina alanı yerine parsel alanını proxy alıyoruz; gerçek bina m² farklı
  // olabilir (kat sayısı × bina footprint). Şu an konservatif yaklaşım: parsel m².
  const aylikKira = Math.round(parsel.alan * birimKira);
  const yillikKira = aylikKira * 12;
  const not = `${parsel.ilAd ?? "Bilinmeyen il"} ortalama ${birimKira} TL/m²/ay — ${parsel.alan} m² × birim kira`;

  return {
    aylikKira,
    yillikKira,
    birimKira,
    kaynak: "statik-il",
    not,
  };
}
