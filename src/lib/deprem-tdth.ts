/**
 * Deprem risk — koordinat bazlı katman.
 *
 * Strateji:
 *  1) AFAD TDTH (Türkiye Deprem Tehlike Haritası) endpoint'i denenir.
 *     PGA + SS + S1 koordinat bazlı dönüyor. Resmi UI: https://tdth.afad.gov.tr/
 *  2) AFAD erişilemezse / Türkiye dışıysa → mevcut `IL_DEPREM` tablosuna fallback
 *     (zon + PGA il ortalaması).
 *
 * USGS Earthquake Hazard global PGA için açık bir REST endpoint sunmuyor
 * (NSHMP-Haz US-only). Türkiye için pratik fallback il-tablosu.
 *
 * Cache: Dexie `depremRiskCache` — 90 gün TTL (deprem tehlike haritası nadiren
 * güncellenir).
 */

import { db } from "./db";
import { IL_DEPREM, type DepremZonu } from "./data/deprem-zonlari";
import { normalizeYerAdi } from "./tkgm-api";

export type DepremKaynak = "afad-tdth" | "il-tablo";

export interface DepremRiskKoord {
  /** 475 yıllık dönüş periyodu PGA (g) */
  pga: number;
  /** Kısa periyot spektral ivme (g) — DD-2 deprem seviyesi (sadece TDTH'tan) */
  ss: number | null;
  /** 1 saniye periyot spektral ivme (g) — DD-2 (sadece TDTH'tan) */
  s1: number | null;
  /** PGA bandı eşleştirmesi (eski 1998 zon haritasıyla uyumlu) */
  zon: DepremZonu;
  /** Ana fay hattı bilgisi (il tablosundan) */
  fay: string | null;
  /** Açıklama / kullanıcı notu */
  not: string;
  /** Veri kaynağı */
  kaynak: DepremKaynak;
}

const CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

function cacheKey(lat: number, lng: number): string {
  // 0.05° ≈ 5 km — TDTH grid çözünürlüğüyle uyumlu
  return `${lat.toFixed(2)}|${lng.toFixed(2)}`;
}

export function pgaToZon(pga: number): DepremZonu {
  if (pga >= 0.40) return "Z1";
  if (pga >= 0.30) return "Z2";
  if (pga >= 0.20) return "Z3";
  if (pga >= 0.10) return "Z4";
  return "Z5";
}

/**
 * PGA değerine göre fiyat çarpanı — il bazlı zon çarpanından daha düz/granüler.
 *
 * Mevcut `depremCarpani(zon)`:
 *   Z1=0.95, Z2=0.98, Z3=1.00, Z4=1.02, Z5=1.03
 *
 * PGA bantları (yumuşatılmış lineer):
 *   pga ≥ 0.50  → 0.93  (yıkıcı bölge — yüksek iskonto)
 *   pga ≥ 0.40  → 0.95
 *   pga ≥ 0.30  → 0.98
 *   pga ≥ 0.20  → 1.00  (nötr — baseline)
 *   pga ≥ 0.10  → 1.02
 *   pga <  0.10 → 1.03
 */
export function pgaCarpani(pga: number | null | undefined): number {
  if (pga == null || !Number.isFinite(pga)) return 1.0;
  if (pga >= 0.50) return 0.93;
  if (pga >= 0.40) return 0.95;
  if (pga >= 0.30) return 0.98;
  if (pga >= 0.20) return 1.00;
  if (pga >= 0.10) return 1.02;
  return 1.03;
}

// NOT (S1.4): AFAD TDTH fetch'ı kaldırıldı. AFAD'ın public API'si stabil değil;
// `tdth.afad.gov.tr/api/v1/sismik/` 404 dönüyor (Mayıs 2026 itibarıyla). Koord-
// bazlı PGA için resmi API çıkana kadar IL_DEPREM tablosu (81 il PGA) varsayılan.
// Gelecekte alternatif (USGS Global Hazard, EFEHR EU) eklenebilir.

function ilTabloFallback(ilAd: string | null | undefined): DepremRiskKoord | null {
  if (!ilAd) return null;
  const ilNorm = normalizeYerAdi(ilAd);
  const il = IL_DEPREM[ilNorm];
  if (!il) return null;
  return {
    pga: il.pga,
    ss: null,
    s1: null,
    zon: il.zon,
    fay: il.fay,
    not: il.not,
    kaynak: "il-tablo",
  };
}

/**
 * Koordinat bazlı deprem risk — il-tablo (AFAD endpoint stabil değil, S1.4'te
 * kaldırıldı). Cache 90 gün (PGA yıllarca aynı).
 *
 * @param lat parsel enlem (cache key için)
 * @param lng parsel boylam (cache key için)
 * @param ilAd TKGM il adı — IL_DEPREM lookup
 * @param _signal Geriye uyumluluk; şu an kullanılmıyor (network çağrısı yok)
 */
export async function depremRiskKoordGetir(
  lat: number,
  lng: number,
  ilAd: string | null | undefined,
  _signal?: AbortSignal,
): Promise<DepremRiskKoord | null> {
  const key = cacheKey(lat, lng);

  // Dexie cache
  try {
    const hit = await db.depremRiskCache.get(key);
    if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) {
      return hit.risk;
    }
  } catch {
    // Dexie yoksa/erişilemezse devam et (test env)
  }

  // İl tablosu — varsayılan ve tek kaynak (AFAD TDTH kaldırıldı)
  const sonuc = ilTabloFallback(ilAd);

  if (sonuc) {
    try {
      await db.depremRiskCache.put({ key, risk: sonuc, fetchedAt: Date.now() });
    } catch {
      // cache yazımı başarısızsa görmezden gel
    }
  }
  return sonuc;
}
