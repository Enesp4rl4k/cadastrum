/**
 * PARSEL ALANI ŞEMASI — birim karışıklığı.
 *
 * `/v1/sorgu` gövdesindeki `m2` alanı, `CoordinatesSchema.shape.radiusKm`
 * şemasını YENİDEN KULLANIYORDU. O şemanın üst sınırı 100 — kilometre için
 * makul, metrekare için felaket.
 *
 * SONUÇ: 100 m²'den büyük her parsel sorgusu 422 ile reddediliyordu. Tipik bir
 * arsa 750–2.500 m², tipik bir tarla 2.500–10.000 m². Yani `toplam_tl` alanı
 * fiilen HİÇ hesaplanamıyordu ve bunu kimse fark etmemişti.
 *
 * NASIL YAKALANDI: Ö3 deploy'undan sonra canlı doğrulama yapılırken
 * `{"m2":1000}` gönderildi ve "Number must be less than or equal to 100"
 * döndü. Şema yeniden kullanımı ucuz görünüyordu ama iki alanın BİRİMİ
 * farklıydı — tip sistemi bunu göremez, ikisi de `number`.
 *
 * MUTASYON: şema `radiusKm`'e geri çevrilirse ilk test kırılır.
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { CoordinatesSchema } from "../src/lib/validation.js";

/** Üretimdeki şemanın birebir kopyası — sözleşmeyi burada kilitliyoruz. */
const SorguGovdesi = CoordinatesSchema.extend({
  m2: z.coerce.number().min(1).max(10_000_000).optional().nullable(),
});

const konum = { lat: 41.14, lng: 28.46, kategori: "arsa" as const };

describe("/v1/sorgu parsel alanı şeması", () => {
  it("tipik arsa büyüklükleri KABUL EDİLİYOR", () => {
    for (const m2 of [750, 1000, 2500]) {
      expect(SorguGovdesi.safeParse({ ...konum, m2 }).success, `${m2} m²`).toBe(true);
    }
  });

  it("tipik tarla büyüklükleri kabul ediliyor", () => {
    for (const m2 of [5000, 20_000, 50_000]) {
      expect(SorguGovdesi.safeParse({ ...konum, m2 }).success, `${m2} m²`).toBe(true);
    }
  });

  /** Sınır hâlâ var — absürt girdi elenmeli. */
  it("absürt alan reddediliyor", () => {
    expect(SorguGovdesi.safeParse({ ...konum, m2: 20_000_000 }).success).toBe(false);
    expect(SorguGovdesi.safeParse({ ...konum, m2: 0 }).success).toBe(false);
    expect(SorguGovdesi.safeParse({ ...konum, m2: -5 }).success).toBe(false);
  });

  it("m2 opsiyonel — verilmezse sorgu geçerli", () => {
    expect(SorguGovdesi.safeParse(konum).success).toBe(true);
    expect(SorguGovdesi.safeParse({ ...konum, m2: null }).success).toBe(true);
  });

  /**
   * BİRİM AYRIMI: radiusKm hâlâ 100 ile sınırlı ve öyle kalmalı — 100 km
   * yarıçap zaten Türkiye'nin yarısını kapsar. İki alan AYNI şemayı
   * paylaşmamalı; bu test o ayrımı kaydediyor.
   */
  it("radiusKm sınırı DEĞİŞMEDİ — iki alanın birimi farklı", () => {
    expect(SorguGovdesi.safeParse({ ...konum, radiusKm: 100 }).success).toBe(true);
    expect(SorguGovdesi.safeParse({ ...konum, radiusKm: 101 }).success).toBe(false);
    // Aynı sayı m² olarak sorunsuz geçmeli — ayrımın kanıtı.
    expect(SorguGovdesi.safeParse({ ...konum, m2: 101 }).success).toBe(true);
  });
});
