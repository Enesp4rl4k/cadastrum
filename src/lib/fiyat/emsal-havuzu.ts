import type { Parsel } from "../../types/tkgm";
import type { IlanGozlem } from "../db";
import type { ManuelEmsal } from "../manuel-veri";
import type { FiyatTahmini } from "./types";
import { normalizeYerAdi } from "../tkgm-api";
import { dovizliMi, fiyatPerM2TLOlarak } from "../kur";
import {
  GUN_MS,
  MAX_ILAN_YASI_GUN,
  EMSAL_MIN_BENZERLIK,
  EMSAL_MAX_SECIM,
  EMSAL_MAX_ILCE_DESTEK,
} from "./constants";
import {
  alanBandi,
  alanBandUyumu,
  segmentBul,
  segmentUyumu,
  imarSiniflandir,
  imarUyumu,
  alanBenzerlikSkoru,
  type EmsalSegment,
  type ImarSinifi,
} from "../carpan-zinciri";

export interface EmsalAdayi {
  kayit: IlanGozlem;
  weight: number;
  areaScore: number;
  bandScore: number;
  locationScore: number;
  segmentScore: number;
  imarScore: number;
  /** Yaþ aðýrlýðý (0-1) — taze ilanlar 1.0, 90+ gün 0.3 */
  yasW: number;
  /** Ýlanýn gün cinsinden yaþý */
  yasGun: number;
  /** TL'ye çevrilmiþ fiyat/m² (USD/EUR ilanlarý için kur uygulanmýþ) */
  fiyatPerM2TL: number;
  /** Ýlan kuruþaltý dövizli mi (UI'da göstermek için) */
  dovizDonusumYapildi: boolean;
  segment: EmsalSegment;
  isSameMahalle: boolean;
  isSameIlce: boolean;
  hasAdaParsel: boolean;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function manuelEmsaliIlanaCevir(parsel: Parsel, m: ManuelEmsal): IlanGozlem {
  return {
    id: -Math.abs(parseInt(m.id.replace(/\D/g, "").slice(0, 9), 10) || 1),
    kaynak: "sahibinden",
    ilanNo: `manuel-${m.id}`,
    url: "manuel://",
    baslik: m.notlar ?? `Manuel emsal (${m.kategori})`,
    ilAd: parsel.ilAd ?? null,
    ilceAd: parsel.ilceAd ?? null,
    mahalleAd: parsel.mahalleAd ?? null,
    ilNorm: null,
    ilceNorm: null,
    mahalleNorm: null,
    imarDurumu: null,
    fiyat: m.fiyatTL,
    m2: m.m2,
    fiyatPerM2: m.fiyatPerM2,
    paraBirimi: "TL",
    adaNo: null,
    parselNo: null,
    zaman: m.girilmeTarihi,
  };
}

export function yasAgirligi(zaman: number): number {
  if (!zaman || zaman <= 0) return 0;
  const gun = (Date.now() - zaman) / GUN_MS;
  if (gun < 0) return 1.0;
  if (gun > MAX_ILAN_YASI_GUN) return 0;
  return Math.exp((-Math.LN2 * gun) / 60);
}

export function weightedAverage(values: Array<{ value: number; weight: number }>): number {
  if (values.length === 0) return 0;
  const totalWeight = values.reduce((s, v) => s + v.weight, 0);
  if (totalWeight <= 0) return 0;
  return values.reduce((s, v) => s + v.value * v.weight, 0) / totalWeight;
}

export function weightedMedian(values: Array<{ value: number; weight: number }>): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a.value - b.value);
  const totalWeight = sorted.reduce((s, v) => s + v.weight, 0);
  if (totalWeight <= 0) return sorted[Math.floor(sorted.length / 2)]?.value ?? 0;
  let acc = 0;
  for (const item of sorted) {
    acc += item.weight;
    if (acc >= totalWeight / 2) return item.value;
  }
  return sorted[sorted.length - 1]?.value ?? 0;
}

export function emsalAdaylariniOlustur(parsel: Parsel, kayitlar: IlanGozlem[]): EmsalAdayi[] {
  const mahalleNorm = parsel.mahalleAd ? normalizeYerAdi(parsel.mahalleAd) : "";
  const ilceNorm = parsel.ilceAd ? normalizeYerAdi(parsel.ilceAd) : "";
  const parselSegment = segmentBul(parsel.nitelik);
  const parselImar = imarSiniflandir(parsel, null);

  const adaylar: EmsalAdayi[] = [];
  for (const kayit of kayitlar) {
    let fiyatPerM2TL: number | null = null;
    if (kayit.paraBirimi === "TL" || kayit.paraBirimi == null) {
      fiyatPerM2TL = typeof kayit.fiyatPerM2 === "number" && kayit.fiyatPerM2 > 0
        ? kayit.fiyatPerM2
        : null;
    } else if (dovizliMi(kayit.paraBirimi)) {
      fiyatPerM2TL = fiyatPerM2TLOlarak(kayit.fiyat, kayit.m2, kayit.paraBirimi);
    }
    if (fiyatPerM2TL == null || fiyatPerM2TL <= 0) continue;

    const yasW = yasAgirligi(kayit.zaman);
    if (yasW === 0) continue;
    const yasGun = Math.max(0, (Date.now() - (kayit.zaman ?? Date.now())) / GUN_MS);

    const kayitIlceNorm = kayit.ilceNorm ?? (kayit.ilceAd ? normalizeYerAdi(kayit.ilceAd) : "");
    const kayitMahalleNorm =
      kayit.mahalleNorm ?? (kayit.mahalleAd ? normalizeYerAdi(kayit.mahalleAd) : "");
    const isSameIlce = !!ilceNorm && kayitIlceNorm === ilceNorm;
    const isSameMahalle = !!mahalleNorm && kayitMahalleNorm === mahalleNorm;
    if (!isSameIlce) continue;

    const segment = segmentBul(`${kayit.baslik ?? ""} ${kayit.imarDurumu ?? ""}`);
    const segmentScore = segmentUyumu(parselSegment, segment);
    const ilanImar = imarSiniflandir(parsel, kayit.imarDurumu);
    const imarScore = imarUyumu(parselImar.sinif, ilanImar.sinif);
    const areaScore = alanBenzerlikSkoru(parsel.alan, kayit.m2);
    const bandScore = alanBandUyumu(parsel.alan, kayit.m2);
    const locationScore = isSameMahalle ? 1 : 0.74;
    const hasAdaParsel = kayit.adaNo != null && kayit.parselNo != null;
    let qualityBonus = 1;
    if (hasAdaParsel) qualityBonus += 0.1;
    if (kayit.imarDurumu) qualityBonus += 0.04;
    if (kayit.baslik) qualityBonus += 0.03;

    const weight = clamp(
      locationScore * segmentScore * imarScore * areaScore * bandScore * qualityBonus * yasW,
      0,
      1.25,
    );
    if (weight < EMSAL_MIN_BENZERLIK) continue;

    adaylar.push({
      kayit,
      weight,
      areaScore,
      bandScore,
      locationScore,
      segmentScore,
      imarScore,
      yasW,
      yasGun,
      fiyatPerM2TL,
      dovizDonusumYapildi: dovizliMi(kayit.paraBirimi),
      segment,
      isSameMahalle,
      isSameIlce,
      hasAdaParsel,
    });
  }

  return adaylar.sort((a, b) => b.weight - a.weight);
}

export function emsalSec(adaylar: EmsalAdayi[]): EmsalAdayi[] {
  const ayniMahalle = adaylar.filter((a) => a.isSameMahalle).slice(0, EMSAL_MAX_SECIM);
  const secilen: EmsalAdayi[] = [...ayniMahalle];
  if (secilen.length >= EMSAL_MAX_SECIM) return secilen;

  const ilceDestek = adaylar
    .filter((a) => !a.isSameMahalle)
    .slice(0, Math.min(EMSAL_MAX_ILCE_DESTEK, EMSAL_MAX_SECIM - secilen.length));
  secilen.push(...ilceDestek);
  return secilen.slice(0, EMSAL_MAX_SECIM);
}
