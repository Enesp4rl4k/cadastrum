/**
 * lib/geo.ts birim testleri
 *
 * Çalıştır: cd backend/api && npm test
 */
import { describe, it, expect } from "vitest";
import { haversineM, turkiyeBboxIcinde, quantize3, kmToDegrees } from "../src/lib/geo.js";

// ── haversineM ───────────────────────────────────────────────────────────────

describe("haversineM", () => {
  it("aynı nokta için 0 döner", () => {
    expect(haversineM(41.0, 29.0, 41.0, 29.0)).toBe(0);
  });

  it("İstanbul → Ankara yaklaşık 350km", () => {
    // İstanbul Taksim: 41.0369, 28.9850 / Ankara Kızılay: 39.9199, 32.8543
    const mesafe = haversineM(41.0369, 28.9850, 39.9199, 32.8543);
    // ~351 km — ±5km tolerans
    expect(mesafe).toBeGreaterThan(346_000);
    expect(mesafe).toBeLessThan(356_000);
  });

  it("1 km kuzey farkı yaklaşık 1000m", () => {
    // 1 derece lat ≈ 111.195 km → 1/111.195 derece ≈ 1 km
    const mesafe = haversineM(40.0, 30.0, 40.009, 30.0);
    expect(mesafe).toBeGreaterThan(950);
    expect(mesafe).toBeLessThan(1050);
  });

  it("Türkiye güney-kuzey enlem farkı (~667 km)", () => {
    // 36°N → 42°N, aynı boylam
    const mesafe = haversineM(36.0, 36.0, 42.0, 36.0);
    expect(mesafe).toBeGreaterThan(650_000);
    expect(mesafe).toBeLessThan(700_000);
  });

  it("negatif koordinat farkı ile pozitif mesafe döner", () => {
    const mesafe = haversineM(41.0, 29.0, 40.0, 28.0);
    expect(mesafe).toBeGreaterThan(0);
  });
});

// ── turkiyeBboxIcinde ────────────────────────────────────────────────────────

describe("turkiyeBboxIcinde", () => {
  it("İstanbul merkezini kabul eder", () => {
    expect(turkiyeBboxIcinde(41.015, 28.979)).toBe(true);
  });

  it("Ankara merkezini kabul eder", () => {
    expect(turkiyeBboxIcinde(39.925, 32.836)).toBe(true);
  });

  it("Edirne köşesini kabul eder", () => {
    expect(turkiyeBboxIcinde(41.67, 26.55)).toBe(true);
  });

  it("Hakkari köşesini kabul eder", () => {
    expect(turkiyeBboxIcinde(37.57, 43.74)).toBe(true);
  });

  it("Yunanistan'ı reddeder", () => {
    expect(turkiyeBboxIcinde(37.97, 23.72)).toBe(false);
  });

  it("Irak'ı reddeder", () => {
    expect(turkiyeBboxIcinde(33.34, 44.40)).toBe(false);
  });

  it("Kuzey kutbunu reddeder", () => {
    expect(turkiyeBboxIcinde(90.0, 0.0)).toBe(false);
  });

  it("sınır değerleri (bbox kenarları) dışarıda kalır", () => {
    // lat ≤ 35 → false
    expect(turkiyeBboxIcinde(35.0, 35.0)).toBe(false);
    // lat ≥ 43 → false
    expect(turkiyeBboxIcinde(43.0, 35.0)).toBe(false);
    // lng ≤ 25 → false
    expect(turkiyeBboxIcinde(40.0, 25.0)).toBe(false);
    // lng ≥ 46 → false
    expect(turkiyeBboxIcinde(40.0, 46.0)).toBe(false);
  });
});

// ── quantize3 ────────────────────────────────────────────────────────────────

describe("quantize3", () => {
  it("3 ondalığa yuvarlar", () => {
    expect(quantize3(41.123456)).toBe(41.123);
  });

  it("zaten 3 ondalıklı değeri değiştirmez", () => {
    expect(quantize3(41.123)).toBe(41.123);
  });

  it("0.0004'ü 0'a yuvarlar", () => {
    expect(quantize3(0.0004)).toBe(0);
  });

  it("negatif değeri doğru yuvarlar", () => {
    expect(quantize3(-29.9876)).toBe(-29.988);
  });
});

// ── kmToDegrees ──────────────────────────────────────────────────────────────

describe("kmToDegrees", () => {
  it("5km → latDelta yaklaşık 0.045", () => {
    const { latDelta } = kmToDegrees(5, 41.0);
    // 5 / 111 ≈ 0.04505
    expect(latDelta).toBeCloseTo(0.045, 2);
  });

  it("latDelta ekvator ve kutup arası değişmez (lat bağımsız)", () => {
    const { latDelta: ld1 } = kmToDegrees(10, 10.0);
    const { latDelta: ld2 } = kmToDegrees(10, 60.0);
    // latDelta = km/111 — lat'ten bağımsız
    expect(ld1).toBeCloseTo(ld2, 5);
  });

  it("lngDelta ekvatorda latDelta'ya eşit (cos(0°)=1)", () => {
    const { latDelta, lngDelta } = kmToDegrees(10, 0.0);
    expect(lngDelta).toBeCloseTo(latDelta, 5);
  });

  it("lngDelta 60°'de latDelta'nın ~2 katı (cos(60°)=0.5 → bölen küçük → delta büyük)", () => {
    const { latDelta, lngDelta } = kmToDegrees(10, 60.0);
    // lngDelta = km / (111 * cos(60°)) = km / (111 * 0.5) = 2 * km/111
    expect(lngDelta).toBeCloseTo(latDelta * 2, 1);
  });

  it("İstanbul enlemi (~41°) için lngDelta > latDelta", () => {
    const { latDelta, lngDelta } = kmToDegrees(5, 41.0);
    // cos(41°) ≈ 0.755 → lngDelta ≈ latDelta / 0.755 > latDelta
    expect(lngDelta).toBeGreaterThan(latDelta);
  });

  it("sıfır km için her ikisi de 0", () => {
    const { latDelta, lngDelta } = kmToDegrees(0, 41.0);
    expect(latDelta).toBe(0);
    expect(lngDelta).toBe(0);
  });
});
