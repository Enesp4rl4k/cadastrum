import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  fiyatiBuguneTasi,
  zamansalTazelikSkoru,
  ilanYasiGunHesapla,
  formatTarihAy,
} from "../src/lib/fiyat/time-decay-engine";
import { enflasyonCarpaniCacheTemizle } from "../src/lib/enflasyon-duzeltme";

// Sistem saatini sabitliyoruz — bu spec daha önce gerçek Date.now()'a göre assert
// ediyordu ve zamanla (özellikle "400 gün önce" gibi göreli hesaplar ve enflasyon
// tablosunun kapsadığı ay aralığı) kendiliğinden kırılabilirdi.
const SABIT_BUGUN = new Date("2026-08-28T12:00:00Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(SABIT_BUGUN);
  enflasyonCarpaniCacheTemizle();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Veri Rafinerisi: time-decay-engine", () => {
  it("formatTarihAy geçerli YYYY-MM döner", () => {
    expect(formatTarihAy("2025-06-15")).toBe("2025-06");
    expect(formatTarihAy(new Date("2026-01-10"))).toBe("2026-01");
  });

  it("ilanYasiGunHesapla gün farkını hesaplar", () => {
    const now = Date.now();
    const gun10Once = now - 10 * 24 * 60 * 60 * 1000;
    expect(ilanYasiGunHesapla(gun10Once)).toBe(10);
  });

  it("zamansalTazelikSkoru yeni ilanlara yüksek, eski ilanlara düşük skor verir", () => {
    expect(zamansalTazelikSkoru(10)).toBe(1.0);
    expect(zamansalTazelikSkoru(45)).toBe(0.92);
    expect(zamansalTazelikSkoru(120)).toBe(0.68);
    expect(zamansalTazelikSkoru(400)).toBeLessThan(0.5);
  });

  it("fiyatiBuguneTasi geçmiş tarihli nominal fiyatı enflasyonla günceller", async () => {
    // 2025-01'deki 1.000 TL/m² fiyatı sabit "bugüne" (2026-08-28) taşındığında
    // artış göstermeli — TUFE_AYLIK tablosu 2025-01..2026-07 arasını kapsıyor.
    const res = await fiyatiBuguneTasi(1000, "2025-01-15", "İstanbul");
    expect(res.nominalFiyatPerM2).toBe(1000);
    expect(res.guncelFiyatPerM2).toBeGreaterThan(1000);
    expect(res.enflasyonCarpani).toBeGreaterThan(1.0);
    expect(res.gunFarki).toBeGreaterThan(100);
    expect(res.ayFarki).toBeGreaterThan(0);
  });

  it("fiyatiBuguneTasi güncel ilanlar için nominal fiyatı korur", async () => {
    const bugun = new Date();
    const res = await fiyatiBuguneTasi(5000, bugun);
    expect(res.nominalFiyatPerM2).toBe(5000);
    expect(res.guncelFiyatPerM2).toBe(5000);
    expect(res.tazelikSkoru).toBe(1.0);
  });
});
