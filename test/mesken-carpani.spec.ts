/**
 * G4 — yapılı parsel (mesken/bina) çarpanı: ölçülemiyor → 1,0 + not.
 *
 * Karar kuralı ölçümden ÖNCE yazıldı (GELISTIRME-PLANI-3 §G4). Hold-out
 * kurulamıyor: backtest parselleri yalnızca "Tarla"/"Arsa" niteliği taşıyor,
 * korpusta mesken ilanı 0. Bu yüzden 2,5× kaldırıldı ve bilgi kullanıcıya not
 * olarak gidiyor — fiyata dokunmadan.
 *
 * MUTASYON: carpan-zinciri.ts'de Mesken/Bina çarpanını 2,5'e geri al → ilk
 * test kırılır.
 */
import { describe, it, expect } from "vitest";
import { nitelikCarpani, yapiliParselNotu } from "../src/lib/carpan-zinciri";

describe("yapılı parsel — ölçülmemiş çarpan fiyata girmez", () => {
  it.each(["Mesken", "Kargir Bina", "Betonarme Bina", "İşyeri"])(
    "%s → çarpan 1,0 (arazi değeri kadar, yapı primi YOK)",
    (n) => {
      expect(nitelikCarpani(n).carpan).toBe(1.0);
    },
  );

  it("yapılı parsel kullanıcıya NOT olarak bildirilir", () => {
    const not = yapiliParselNotu("Mesken");
    expect(not).toContain("yapılı");
    expect(not).toContain("ARAZİ");
    expect(not).toContain("ölçülmedi");
  });

  it("yapısız parselde not ÜRETİLMEZ — gürültü olmasın", () => {
    expect(yapiliParselNotu("Tarla")).toBeNull();
    expect(yapiliParselNotu("Arsa")).toBeNull();
  });

  /**
   * TÜRKÇE BÜYÜK HARF — testi yazarken ortaya çıktı.
   *
   * JS `/i` büyük `İ`yi `i`ye katlamıyor (`/u` ile de). "İşyeri" TKGM'nin
   * kanonik yazımı ve mesken kuralı ona HİÇ uygulanmıyordu: "Bilinmeyen nitelik"
   * 0,5× alıyordu. Aynı tuzak tablonun tamamında.
   *
   * MUTASYON: nitelikCarpani'deki `|| n.pattern.test(trKucuk)`'ı kaldır → kırılır.
   */
  it.each([
    ["İşyeri", "Mesken / Bina"],
    ["İŞYERİ", "Mesken / Bina"],
    ["KARGİR BİNA", "Mesken / Bina"],
    ["ZEYTİNLİK", "Zeytinlik"],
  ])("büyük İ içeren %s doğru satırla eşleşir (%s)", (n, ad) => {
    expect(nitelikCarpani(n).ad).toBe(ad);
  });

  it("büyük İ içeren yapılı parsel de NOT üretir", () => {
    expect(yapiliParselNotu("İşyeri")).not.toBeNull();
    expect(yapiliParselNotu("KARGİR BİNA")).not.toBeNull();
  });

  it("ASCII büyük harf de eşleşmeye devam eder (Türkçe küçültme 'I'yı 'ı' yapar)", () => {
    expect(nitelikCarpani("ISYERI").ad).toBe("Mesken / Bina");
    expect(nitelikCarpani("TARLA").ad).toBe("Tarla");
  });

  /**
   * NİTELİK'SİZ PARSEL FIRLATMAZ — bu düzeltmenin kendi regresyonu.
   *
   * Türkçe küçültme ilk eklendiğinde `nitelik.toLocaleLowerCase` `undefined`
   * üzerinde TypeError fırlattı. Üç ajan testi (canli-demo, multi-agent,
   * kullanici-firsat-tarayici) HEAD'de geçip bu değişiklikle zaman aşımına
   * düştü — hata yutulduğu için "fırlattı" değil "asılı kaldı" göründü.
   * Backtest her kayda nitelik verdiği için bunu yakalayamazdı.
   *
   * MUTASYON: carpan-zinciri.ts'de `(nitelik ?? "")`'yi `nitelik` yap → kırılır.
   */
  it("nitelik'siz parsel fırlatmaz, eski davranışa (varsayılan) düşer", () => {
    const bos = undefined as unknown as string;
    expect(() => nitelikCarpani(bos)).not.toThrow();
    expect(nitelikCarpani(bos).ad).toBe("Diğer");
    expect(yapiliParselNotu(bos)).toBeNull();
  });

  it("arsa ve tarla çarpanları DEĞİŞMEDİ — backtest'in ölçtüğü tek iki yol", () => {
    expect(nitelikCarpani("Arsa").carpan).toBe(1.0);
    expect(nitelikCarpani("Tarla").carpan).toBe(0.25);
  });
});
