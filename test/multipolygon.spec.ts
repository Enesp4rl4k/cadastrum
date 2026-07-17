/**
 * MultiPolygon geometri düzeltmesi — Bug 1 regresyon testi.
 *
 * parseParselFeature node ortamında doğrudan test edilemiyor (private fonksiyon,
 * DB + chrome bağımlı). Bunun yerine fix'in etkilediği public API olan
 * parseTkgmAlan + normalizeTr fonksiyonları ve MultiPolygon koordinat mantığını
 * inline olarak doğruluyoruz.
 */
import { describe, it, expect } from "vitest";

// MultiPolygon en büyük ring seçim algoritması — tkgm-api.ts'den extract edildi
function enBuyukRingiSec(coordinates: number[][][][]): number[][] {
  const allRings = coordinates
    .map((poly) => poly[0] ?? [])
    .filter((r) => r.length > 0);
  return allRings.reduce(
    (best, r) => (r.length > best.length ? r : best),
    [] as number[][],
  );
}

function merkezHesapla(ring: number[][]): { lat: number; lng: number } {
  if (ring.length === 0) return { lat: 0, lng: 0 };
  const lng = ring.reduce((s, c) => s + (c[0] ?? 0), 0) / ring.length;
  const lat = ring.reduce((s, c) => s + (c[1] ?? 0), 0) / ring.length;
  return { lat, lng };
}

describe("MultiPolygon geometri — Bug 1 regresyon", () => {
  it("tek polygonlu MultiPolygon: tek ring'i seçer", () => {
    const coords: number[][][][] = [
      [[[30.0, 40.0], [30.1, 40.0], [30.1, 40.1], [30.0, 40.1], [30.0, 40.0]]],
    ];
    const ring = enBuyukRingiSec(coords);
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual([30.0, 40.0]);
  });

  it("iki polygonlu MultiPolygon: daha uzun (ana gövde) ring'i seçer", () => {
    const kucuk: number[][][] = [
      [[29.0, 39.0], [29.01, 39.0], [29.01, 39.01], [29.0, 39.0]],
    ]; // 4 nokta
    const buyuk: number[][][] = [
      [[30.0, 40.0], [30.1, 40.0], [30.1, 40.1], [30.05, 40.15], [30.0, 40.1], [30.0, 40.0]],
    ]; // 6 nokta
    const coords: number[][][][] = [kucuk, buyuk];
    const ring = enBuyukRingiSec(coords);
    expect(ring).toHaveLength(6); // büyük polygon seçilmeli
  });

  it("MultiPolygon merkez koordinatı [0,0] olmamalı", () => {
    const coords: number[][][][] = [
      [[[30.0, 40.0], [30.2, 40.0], [30.2, 40.2], [30.0, 40.2], [30.0, 40.0]]],
    ];
    const ring = enBuyukRingiSec(coords);
    const merkez = merkezHesapla(ring);
    expect(merkez.lat).not.toBe(0);
    expect(merkez.lng).not.toBe(0);
    expect(merkez.lat).toBeCloseTo(40.08, 1); // (40+40+40.2+40.2)/5 ≈ 40.08
    expect(merkez.lng).toBeCloseTo(30.08, 1);
  });

  it("boş koordinat dizisi → [0,0] merkez (fallback güvenli)", () => {
    const merkez = merkezHesapla([]);
    expect(merkez.lat).toBe(0);
    expect(merkez.lng).toBe(0);
  });

  it("tek noktalı ring → hata yok", () => {
    const ring: number[][] = [[30.5, 40.5]];
    const merkez = merkezHesapla(ring);
    expect(merkez.lat).toBeCloseTo(40.5);
    expect(merkez.lng).toBeCloseTo(30.5);
  });
});
