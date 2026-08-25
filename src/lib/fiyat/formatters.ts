/**
 * fiyat/formatters.ts — Para birimi formatlama yardımcıları.
 *
 * Bu dosya fiyat-tahmin.ts'ten çıkarılmıştır.
 * Geriye dönük uyumluluk: fiyat-tahmin.ts bu dosyayı re-export eder.
 */

/** Para birimi gösterimi: 1.250.000 TL veya 1,25 M TL */
export function fmtTL(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)} Milyar TL`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} M TL`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K TL`;
  return `${n.toLocaleString("tr-TR")} TL`;
}

/** TL/m² formatı: 12.500 TL/m² */
export function fmtTLM2(n: number): string {
  return `${n.toLocaleString("tr-TR")} TL/m²`;
}

/** Kısa TL formatı: 1.5M, 250K, 18.000 */
export function fmtTLKisa(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}Milyar TL`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M TL`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K TL`;
  return `${n.toLocaleString("tr-TR")} TL`;
}
