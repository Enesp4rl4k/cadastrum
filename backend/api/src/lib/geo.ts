/**
 * Ortak coğrafi yardımcı fonksiyonlar.
 *
 * Bu modül daha önce sorgu.ts ve emsal-spatial.ts içinde ayrı ayrı
 * tanımlanmış olan fonksiyonları tek yerde toplar.
 *
 * Kullanım:
 *   import { haversineM, turkiyeBboxIcinde, quantize3 } from "../lib/geo.js";
 */

/** Türkiye bounding box — tüm koordinat doğrulamaları bu fonksiyonu kullanır. */
export function turkiyeBboxIcinde(lat: number, lng: number): boolean {
  return lat > 35 && lat < 43 && lng > 25 && lng < 46;
}

/**
 * Haversine mesafe hesabı — metre cinsinden.
 * Cloudflare Workers'da Math.sqrt/asin desteklenir, kütüphane gerektirmez.
 */
export function haversineM(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000; // Dünya yarıçapı (metre)
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * K-anonymity koordinat quantize — 3 ondalık ≈ 110m hassasiyet.
 * İlan koordinatları DB'ye yazılmadan önce bu fonksiyondan geçer.
 */
export function quantize3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/**
 * Bbox delta hesabı — lat/lng aralıkları için km → derece dönüşümü.
 * İzotropik değil: lng için cos(lat) düzeltmesi uygulanır.
 */
export function kmToDegrees(
  km: number,
  lat: number,
): { latDelta: number; lngDelta: number } {
  const latDelta = km / 111;
  const lngDelta = km / (111 * Math.cos((lat * Math.PI) / 180));
  return { latDelta, lngDelta };
}
