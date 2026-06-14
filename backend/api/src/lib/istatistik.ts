/**
 * İstatistik fonksiyonları — medyan, çeyrek, IQR outlier temizleme.
 * Extension'ın src/lib/fiyat-correction.ts'inden uyarlandı.
 */

export function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

export function quartile(arr: number[], q: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] !== undefined
    ? sorted[base]! + rest * (sorted[base + 1]! - sorted[base]!)
    : sorted[base]!;
}

/**
 * Tukey IQR outlier temizleme: Q1 - 1.5*IQR ile Q3 + 1.5*IQR arası tutulur.
 */
export function outlierTemizle(arr: number[]): { temiz: number[]; cikarilan: number[] } {
  if (arr.length < 4) return { temiz: [...arr], cikarilan: [] };
  const q1 = quartile(arr, 0.25);
  const q3 = quartile(arr, 0.75);
  const iqr = q3 - q1;
  const alt = q1 - 1.5 * iqr;
  const ust = q3 + 1.5 * iqr;
  const temiz: number[] = [];
  const cikarilan: number[] = [];
  for (const v of arr) {
    if (v >= alt && v <= ust) temiz.push(v);
    else cikarilan.push(v);
  }
  return { temiz, cikarilan };
}

export interface IstatistikOzeti {
  medyan: number;
  ortalama: number;
  q1: number;
  q3: number;
  adet: number;
  outlierAdet: number;
}

/**
 * Bir fiyat dizisinden istatistik özeti üret (outlier temizlemesi sonrası).
 */
export function istatistikOzetiHesapla(fiyatlar: number[]): IstatistikOzeti {
  const { temiz, cikarilan } = outlierTemizle(fiyatlar);
  if (temiz.length === 0) {
    return { medyan: 0, ortalama: 0, q1: 0, q3: 0, adet: 0, outlierAdet: cikarilan.length };
  }
  const ortalama = temiz.reduce((s, v) => s + v, 0) / temiz.length;
  return {
    medyan: median(temiz),
    ortalama,
    q1: quartile(temiz, 0.25),
    q3: quartile(temiz, 0.75),
    adet: temiz.length,
    outlierAdet: cikarilan.length,
  };
}
