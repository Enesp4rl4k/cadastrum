/**
 * Fiyat correction katmanı.
 * Sahibinden = ASKING fiyat (ilan fiyatı, kapanış fiyatı değil).
 * Türkiye gayrimenkul piyasasında ortalama %10-15 indirimli kapanır.
 *
 * Bu modül:
 *  1. Asking → estimated kapanış correction
 *  2. Outlier rejection (Tukey IQR)
 *  3. Trim mean / median seçimi
 *  4. Bölge volatilite hesabı (CV — coefficient of variation)
 */

/** Türkiye ortalama asking → kapanış indirimi (2025 piyasa verisi) */
export const ASKING_KAPANIS_INDIRIM = 0.12;

export interface IndirimModeliOptions {
  segment?: "arsa" | "tarla";
  ortalamaYasGun?: number;
  ayniMahalleOrani?: number;
  alanUyumOrani?: number;
}

/** Bölgenin likiditesine göre dinamik indirim — yoğun bölgede %8, sapa bölgede %18 */
export function dinamikIndirimOrani(
  ilanSayisi: number,
  ortalamaIslemSayisi: number, // TKGM resmi yıllık ortalama
  options: IndirimModeliOptions = {},
): number {
  let oran = ASKING_KAPANIS_INDIRIM;

  // Likit bölge (çok ilan + çok işlem): %8
  // Orta likit: %12
  // Sapa: %18
  if (ilanSayisi >= 20 || ortalamaIslemSayisi >= 50) oran = 0.08;
  else if (ilanSayisi >= 5 || ortalamaIslemSayisi >= 10) oran = 0.12;
  else oran = 0.18;

  if (options.segment === "tarla") oran += 0.03;
  if (options.segment === "arsa") oran -= 0.01;

  if ((options.ortalamaYasGun ?? 0) > 120) oran += 0.03;
  else if ((options.ortalamaYasGun ?? 0) > 60) oran += 0.015;
  else if ((options.ortalamaYasGun ?? 0) <= 21 && ilanSayisi >= 4) oran -= 0.01;

  if ((options.ayniMahalleOrani ?? 0) >= 0.7) oran -= 0.01;
  if ((options.alanUyumOrani ?? 0) >= 0.7) oran -= 0.01;
  else if ((options.alanUyumOrani ?? 0) < 0.35) oran += 0.015;

  return Math.min(0.24, Math.max(0.06, Number(oran.toFixed(3))));
}

export interface OutlierTemizSonuc {
  temiz: number[];
  cikarilan: number[];
  q1: number;
  q3: number;
  iqr: number;
}

/**
 * Tukey IQR yöntemi — Q1-1.5×IQR ile Q3+1.5×IQR dışındakileri at.
 * Sahibinden'de tek-tük 1 TL/m² (boş ilan) veya 500K TL/m² (köşe parsel premium) olabilir.
 */
export function outlierTemizle(degerler: number[]): OutlierTemizSonuc {
  if (degerler.length < 4) {
    return { temiz: [...degerler], cikarilan: [], q1: 0, q3: 0, iqr: 0 };
  }
  const sirali = [...degerler].sort((a, b) => a - b);
  const n = sirali.length;
  const q1Idx = Math.floor(n / 4);
  const q3Idx = Math.floor((n * 3) / 4);
  const q1 = sirali[q1Idx] ?? 0;
  const q3 = sirali[q3Idx] ?? 0;
  const iqr = q3 - q1;
  const altSinir = q1 - 1.5 * iqr;
  const ustSinir = q3 + 1.5 * iqr;
  const temiz: number[] = [];
  const cikarilan: number[] = [];
  for (const v of degerler) {
    if (v >= altSinir && v <= ustSinir) temiz.push(v);
    else cikarilan.push(v);
  }
  return { temiz, cikarilan, q1, q3, iqr };
}

/** Median — outlier dirençli ortalama */
export function median(degerler: number[]): number {
  if (degerler.length === 0) return 0;
  const sirali = [...degerler].sort((a, b) => a - b);
  const n = sirali.length;
  return n % 2 === 0
    ? ((sirali[n / 2 - 1] ?? 0) + (sirali[n / 2] ?? 0)) / 2
    : sirali[Math.floor(n / 2)] ?? 0;
}

/** Trim mean — alt/üst %25 at, kalanın ortalaması (median ve mean arası) */
export function trimMean(degerler: number[], trimYuzde = 0.25): number {
  if (degerler.length === 0) return 0;
  if (degerler.length < 4) {
    return degerler.reduce((s, v) => s + v, 0) / degerler.length;
  }
  const sirali = [...degerler].sort((a, b) => a - b);
  const trimSayi = Math.floor(sirali.length * trimYuzde);
  const trimli = sirali.slice(trimSayi, sirali.length - trimSayi);
  return trimli.reduce((s, v) => s + v, 0) / trimli.length;
}

/** Coefficient of variation — bölge fiyat volatilitesi (CV %) */
export function variationKatsayisi(degerler: number[]): number {
  if (degerler.length < 2) return 0;
  const mean = degerler.reduce((s, v) => s + v, 0) / degerler.length;
  if (mean === 0) return 0;
  const variance =
    degerler.reduce((s, v) => s + (v - mean) ** 2, 0) / degerler.length;
  const std = Math.sqrt(variance);
  return Math.round((std / mean) * 100);
}

export interface BolgeFiyatOzeti {
  /** Median (outlier-temiz) — en sağlam tahmin */
  medianAsking: number;
  /** Trim mean (alt/üst %25 atılmış) */
  trimMeanAsking: number;
  /** Asking → kapanış correction uygulanmış median */
  estimatedKapanis: number;
  /** Kullanılan indirim oranı */
  uygulanmisIndirim: number;
  /** Çıkarılan outlier sayısı */
  outlierSayisi: number;
  /** Geçerli (outlier'siz) örnek sayısı */
  gecerliOrnek: number;
  /** Volatilite — CV % */
  volatilite: number;
  /** Güven seviyesi */
  guvenSeviyesi: "yuksek" | "orta" | "dusuk";
  guvenAciklama: string;
}

export function bolgeFiyatOzetiHesapla(
  askingFiyatlar: number[],
  options: { tkgmYillikIslem?: number } = {},
): BolgeFiyatOzeti {
  const { temiz, cikarilan } = outlierTemizle(askingFiyatlar);
  const med = median(temiz);
  const trim = trimMean(temiz);
  const indirim = dinamikIndirimOrani(temiz.length, options.tkgmYillikIslem ?? 0);
  const estimatedKapanis = Math.round(med * (1 - indirim));
  const cv = variationKatsayisi(temiz);

  let guven: "yuksek" | "orta" | "dusuk" = "dusuk";
  let guvenAciklama = "";
  if (temiz.length >= 10 && cv < 30) {
    guven = "yuksek";
    guvenAciklama = `${temiz.length} ilan, düşük volatilite (CV %${cv}). Sağlam tahmin.`;
  } else if (temiz.length >= 5 && cv < 50) {
    guven = "orta";
    guvenAciklama = `${temiz.length} ilan, orta volatilite (CV %${cv}). Dikkatli yorumla.`;
  } else if (temiz.length >= 3) {
    guven = "dusuk";
    guvenAciklama = `${temiz.length} ilan, yüksek volatilite (CV %${cv}) — daha çok ilan açtıkça doğruluk artar.`;
  } else {
    guven = "dusuk";
    guvenAciklama = `Sadece ${temiz.length} ilan — istatistiksel olarak güvenilir değil.`;
  }

  return {
    medianAsking: Math.round(med),
    trimMeanAsking: Math.round(trim),
    estimatedKapanis,
    uygulanmisIndirim: Math.round(indirim * 100),
    outlierSayisi: cikarilan.length,
    gecerliOrnek: temiz.length,
    volatilite: cv,
    guvenSeviyesi: guven,
    guvenAciklama,
  };
}
