/**
 * emsal-mukayese.ts unit testleri
 *
 * Test kapsamı (saf/export edilen fonksiyonlar):
 *   - alanDuzeltme    — logaritmik alan farkı düzeltmesi
 *   - tarihDuzeltme   — enflasyon bazlı tarih düzeltmesi
 *   - nitelikKategori — nitelik metin → kategori eşleştirmesi
 *
 * emsalMukayeseEt() dış I/O bağımlılıkları (kur, API) içerdiğinden
 * integration seviyesinde test kapsamı dışında tutuldu.
 */
import { describe, it, expect } from "vitest";
import {
  alanDuzeltme,
  tarihDuzeltme,
  nitelikKategori,
} from "../src/lib/emsal-mukayese";

// ── alanDuzeltme ──────────────────────────────────────────────────────────────

describe("alanDuzeltme", () => {
  it("emsal alan null → düzeltme 0, not dolu", () => {
    const r = alanDuzeltme(1000, null);
    expect(r.carpan).toBe(0);
    expect(r.not.length).toBeGreaterThan(0);
  });

  it("emsal alan 0 → düzeltme 0", () => {
    const r = alanDuzeltme(1000, 0);
    expect(r.carpan).toBe(0);
  });

  it("parsel alan 0 → düzeltme 0", () => {
    const r = alanDuzeltme(0, 1000);
    expect(r.carpan).toBe(0);
  });

  it("aynı alan → düzeltme 0 (önemsiz fark)", () => {
    const r = alanDuzeltme(1000, 1000);
    expect(Math.abs(r.carpan)).toBeLessThan(0.005);
  });

  it("emsal büyükse → pozitif carpan (emsal fiyat yukarı çekilir)", () => {
    // 2000 / 1000 = 2.0x → log10(2) * 0.05 ≈ 0.015
    const r = alanDuzeltme(1000, 2000);
    expect(r.carpan).toBeGreaterThan(0);
  });

  it("emsal küçükse → negatif carpan (emsal fiyat aşağı çekilir)", () => {
    // 500 / 1000 = 0.5x → log10(0.5) * 0.05 ≈ -0.015
    const r = alanDuzeltme(1000, 500);
    expect(r.carpan).toBeLessThan(0);
  });

  it("büyük fark → büyük mutlak düzeltme (monotonluk)", () => {
    const kucukFark = alanDuzeltme(1000, 2000);  // 2x
    const buyukFark = alanDuzeltme(1000, 10000); // 10x
    expect(Math.abs(buyukFark.carpan)).toBeGreaterThan(Math.abs(kucukFark.carpan));
  });

  it("not alanı her zaman dolu string", () => {
    expect(alanDuzeltme(1000, 2000).not.length).toBeGreaterThan(0);
    expect(alanDuzeltme(1000, 500).not.length).toBeGreaterThan(0);
  });
});

// ── tarihDuzeltme ─────────────────────────────────────────────────────────────

describe("tarihDuzeltme", () => {
  it("≤7 gün → 0 (güncel ilan, düzeltme yok)", () => {
    expect(tarihDuzeltme(0).carpan).toBe(0);
    expect(tarihDuzeltme(7).carpan).toBe(0);
  });

  it("8+ gün → pozitif carpan (enflasyon düzeltmesi)", () => {
    expect(tarihDuzeltme(30).carpan).toBeGreaterThan(0);
    expect(tarihDuzeltme(180).carpan).toBeGreaterThan(0);
  });

  it("daha eski ilan → daha büyük düzeltme (monoton)", () => {
    const r30  = tarihDuzeltme(30);
    const r90  = tarihDuzeltme(90);
    const r180 = tarihDuzeltme(180);
    expect(r90.carpan).toBeGreaterThan(r30.carpan);
    expect(r180.carpan).toBeGreaterThan(r90.carpan);
  });

  it("180 gün (~6 ay) → ~%9 düzeltme (1.5%/ay × 6)", () => {
    const r = tarihDuzeltme(180);
    // 6 ay × 0.015 = 0.09
    expect(r.carpan).toBeCloseTo(0.09, 2);
  });

  it("not alanı gün/ay bilgisi içeriyor", () => {
    const r = tarihDuzeltme(60);
    expect(r.not).toContain("ay");
  });
});

// ── nitelikKategori ───────────────────────────────────────────────────────────

describe("nitelikKategori", () => {
  it("Arsa → arsa", () => {
    expect(nitelikKategori("Arsa")).toBe("arsa");
    expect(nitelikKategori("Hisseli Arsa")).toBe("arsa");
  });
  it("Tarla → tarla", () => {
    expect(nitelikKategori("Tarla")).toBe("tarla");
    expect(nitelikKategori("Tarla (Hisseli)")).toBe("tarla");
  });
  it("Bahçe/Bağ → bahce", () => {
    expect(nitelikKategori("Bahçe")).toBe("bahce");
    expect(nitelikKategori("Bahce")).toBe("bahce");
    expect(nitelikKategori("Bağ")).toBe("bahce");
  });
  it("Zeytinlik → zeytin", () => {
    expect(nitelikKategori("Zeytinlik")).toBe("zeytin");
  });
  it("Mesken/Bina/İşyeri → yapili", () => {
    expect(nitelikKategori("Mesken")).toBe("yapili");
    expect(nitelikKategori("Bina")).toBe("yapili");
    expect(nitelikKategori("İşyeri")).toBe("yapili");
  });
  it("bilinmeyen → diger", () => {
    expect(nitelikKategori("")).toBe("diger");
    expect(nitelikKategori("BilinmeyenNitelik")).toBe("diger");
  });
  it("büyük/küçük harf farklılığı → tutarlı", () => {
    expect(nitelikKategori("ARSA")).toBe("arsa");
    expect(nitelikKategori("mesken")).toBe("yapili");
  });
});
