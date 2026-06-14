/**
 * Görselleştirme yardımcıları — color scale, normalization, geojson dönüşümü.
 */

import type { AnalizNoktasi } from "./tkgm-analiz";

/**
 * YlOrRd-vari color ramp. 0-1 arasındaki değer → CSS rgb().
 * Yoğunluk haritası için yaygın seçim.
 */
export function yogunlukRengi(t: number): string {
  // [#fffeb3 (sarı) → #fdae61 (turuncu) → #d7191c (koyu kırmızı)]
  const stops: [number, [number, number, number]][] = [
    [0.0, [255, 254, 179]],
    [0.5, [253, 174, 97]],
    [1.0, [215, 25, 28]],
  ];
  const x = Math.max(0, Math.min(1, t));
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1]!;
    const b = stops[i]!;
    if (x <= b[0]) {
      const f = (x - a[0]) / (b[0] - a[0]);
      const r = Math.round(a[1][0] + (b[1][0] - a[1][0]) * f);
      const g = Math.round(a[1][1] + (b[1][1] - a[1][1]) * f);
      const bl = Math.round(a[1][2] + (b[1][2] - a[1][2]) * f);
      return `rgb(${r},${g},${bl})`;
    }
  }
  return `rgb(${stops[stops.length - 1]![1].join(",")})`;
}

/** Log-normalize: aykırı yüksek değerler de görünebilsin diye */
export function logNorm(value: number, max: number): number {
  if (max <= 0) return 0;
  const lv = Math.log1p(value);
  const lm = Math.log1p(max);
  return lm > 0 ? lv / lm : 0;
}

/** Analiz noktalarını MapLibre circle-layer için GeoJSON FeatureCollection'a dönüştür. */
export function analizNoktalariGeoJson(
  noktalar: AnalizNoktasi[],
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: noktalar.map((n) => ({
      type: "Feature",
      properties: { sayi: n.sayi, parselId: n.parselId },
      geometry: { type: "Point", coordinates: [n.boylam, n.enlem] },
    })),
  };
}

/** Bir sayı dizisi için 0-1'e log-normalized değerler — sparkline / bar için */
export function normalizeArray(values: number[]): number[] {
  if (values.length === 0) return [];
  const max = Math.max(...values);
  return values.map((v) => logNorm(v, max));
}

/** Dakikalık sayı formatı: 1500 → "1,5K", 1_250_000 → "1,25M" */
export function compactSayi(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}K`;
  return `${(n / 1_000_000).toLocaleString("tr-TR", { maximumFractionDigits: 2 })}M`;
}
