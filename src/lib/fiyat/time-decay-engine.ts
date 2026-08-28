/**
 * Veri Rafinerisi — Zaman Serisi & Enflasyon Endeksleme Motoru (Time-Decay Engine)
 *
 * Problem: Türkiye'deki yüksek enflasyon ortamında (yıllık %30 - %75),
 * 6 ay önceki 1.000 TL/m²'lik ilan bugünün 1.500 TL/m²'sine denk gelir.
 * Eski ilanları doğrudan ham fiyattan kullanmak sistemi aşırı düşük (negatif bias)
 * veya orantısız tahmin yapmaya iter.
 *
 * Bu modül:
 * 1. İlan tarihini alır (timestamp, ISO string veya Date).
 * 2. İlan tarihi ile bugünkü tarih arasındaki ay ve gün farkını hesaplar.
 * 3. TCMB KFE ve TÜİK bileşik enflasyon serisini uygulayarak nominal fiyatı bugünkü değere taşır.
 * 4. İlan yaşına göre zamansal güven/tazelik ağırlığı (time-decay weight) üretir.
 */

import { enflasyonCarpaniniGetir } from "../enflasyon-duzeltme";
import { normalizeYerAdi } from "../tkgm-api";

export interface ZamanEndekslemeSonuc {
  /** İlanın orijinal tarihteki nominal fiyatı (TL/m²) */
  nominalFiyatPerM2: number;
  /** Enflasyonla bugünkü piyasa koşullarına taşınmış güncel fiyatı (TL/m²) */
  guncelFiyatPerM2: number;
  /** Uygulanan toplam enflasyon katsayısı (örn: 1.34 = %34 artış) */
  enflasyonCarpani: number;
  /** İlanın yaşı (gün cinsinden) */
  gunFarki: number;
  /** İlanın yaşı (ay cinsinden) */
  ayFarki: number;
  /** Zamansal tazelik güven skoru (0.10 ile 1.00 arası, taze ilan = 1.0) */
  tazelikSkoru: number;
  /** İlan tarihi formatı */
  ilanAy: string;
  /** Değerleme yapılan bugünkü ay */
  bugunAy: string;
  /** Kullanıcı veya log için bilgilendirici not */
  aciklama: string;
}

const GUN_MS = 24 * 60 * 60 * 1000;

/**
 * Tarih nesnesi veya string'i "YYYY-MM" formatına çevirir.
 */
export function formatTarihAy(tarih: string | number | Date | null | undefined): string {
  if (!tarih) {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  const d = typeof tarih === "number" || typeof tarih === "string" ? new Date(tarih) : tarih;
  if (isNaN(d.getTime())) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * İlan yaşını gün cinsinden hesaplar.
 */
export function ilanYasiGunHesapla(tarih: string | number | Date | null | undefined): number {
  if (!tarih) return 0;
  const d = typeof tarih === "number" || typeof tarih === "string" ? new Date(tarih) : tarih;
  if (isNaN(d.getTime())) return 0;
  const diffMs = Date.now() - d.getTime();
  return Math.max(0, Math.round(diffMs / GUN_MS));
}

/**
 * İlan yaşına göre üstel/kademeli zamansal tazelik ağırlığı (decay weight) hesaplar.
 *
 * 0 - 30 gün:  1.00 (Tam taze)
 * 31 - 60 gün: 0.92
 * 61 - 90 gün: 0.82
 * 91 - 180 gün: 0.68
 * 181 - 365 gün: 0.50
 * > 365 gün: 0.30
 *
 * Not: emsal-havuzu.ts:MAX_ILAN_YASI_GUN (180 gün) canlı emsal havuzunda zaten
 * sert bir yaş kesimi uyguluyor (180+ gün → tamamen elenir), bu yüzden bu
 * fonksiyonun 180 gün üzeri kademeleri o yolda hiç tetiklenmez. Bu modülün
 * doğrudan çalıştığı diğer bağlamlarda (örn. bağımsız veri rafineri script'i)
 * daha eski ilanlar da işlenebildiği için tam eğri korunuyor.
 */
export function zamansalTazelikSkoru(gunFarki: number): number {
  if (gunFarki <= 30) return 1.0;
  if (gunFarki <= 60) return 0.92;
  if (gunFarki <= 90) return 0.82;
  if (gunFarki <= 180) return 0.68;
  if (gunFarki <= 365) return 0.50;
  return Math.max(0.20, Number((0.50 * Math.exp(-((gunFarki - 365) / 365))).toFixed(2)));
}

/**
 * Nominal ilan m² fiyatını bugünkü enflasyon ve TCMB koşullarına taşır.
 */
export async function fiyatiBuguneTasi(
  nominalFiyatPerM2: number,
  ilanTarihi: string | number | Date | null | undefined,
  ilAd?: string | null,
): Promise<ZamanEndekslemeSonuc> {
  const nominal = Number(nominalFiyatPerM2) || 0;
  if (nominal <= 0) {
    return {
      nominalFiyatPerM2: 0,
      guncelFiyatPerM2: 0,
      enflasyonCarpani: 1.0,
      gunFarki: 0,
      ayFarki: 0,
      tazelikSkoru: 1.0,
      ilanAy: formatTarihAy(new Date()),
      bugunAy: formatTarihAy(new Date()),
      aciklama: "Geçersiz nominal fiyat.",
    };
  }

  const ilanAy = formatTarihAy(ilanTarihi);
  const now = new Date();
  const bugunAy = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const gunFarki = ilanYasiGunHesapla(ilanTarihi);
  const tazelikSkoru = zamansalTazelikSkoru(gunFarki);

  // Enflasyon motorunu çağır
  const ilNorm = ilAd ? normalizeYerAdi(ilAd) : undefined;
  const enflasyonSonuc = await enflasyonCarpaniniGetir(ilanAy, ilNorm);
  const carpan = enflasyonSonuc.carpan > 0 ? enflasyonSonuc.carpan : 1.0;

  const guncelFiyatPerM2 = Math.round(nominal * carpan);

  // Ay farkı hesabı
  const [iy, im] = ilanAy.split("-").map(Number) as [number, number];
  const [by, bm] = bugunAy.split("-").map(Number) as [number, number];
  const ayFarki = Math.max(0, (by - iy) * 12 + (bm - im));

  let aciklama = `${gunFarki} günlük ilan`;
  if (carpan > 1.01) {
    const artisYuzde = Math.round((carpan - 1) * 100);
    aciklama += ` — %${artisYuzde} enflasyon düzeltmesiyle ${nominal.toLocaleString("tr-TR")} TL → ${guncelFiyatPerM2.toLocaleString("tr-TR")} TL/m² taşındı`;
  } else {
    aciklama += " — Güncel dönem ilanı (ek enflasyon düzeltmesi gerekmedi)";
  }

  return {
    nominalFiyatPerM2: nominal,
    guncelFiyatPerM2,
    enflasyonCarpani: Number(carpan.toFixed(3)),
    gunFarki,
    ayFarki,
    tazelikSkoru,
    ilanAy,
    bugunAy,
    aciklama,
  };
}
