/**
 * SÖZLEŞME TESTİ — sentetik baseline ilanı gözlem havuzuna giremez.
 *
 * NEDEN: `scripts/seed-baseline-sql.mjs` (2026-09-04'te silindi), statik
 * `mahalle-baseline.ts` tahminlerinden 109.272 satır üretip **`kaynak='extension'`**
 * etiketiyle `ilanlar` tablosuna basıyordu. Yani türetilmiş bir tahmin, gerçek
 * kullanıcı yakalamasından ayırt edilemez bir etiketle gözlem havuzuna giriyordu.
 *
 * Tek ayırt edici işaret `ilan_no`'daki `bl_` önekiydi ve onu filtreleyen tek
 * satır kod yoktu: emsal havuzu, spatial motor, ilçe/mahalle medyanları, güven
 * skoru ve backtest hepsi o satırları gerçek gözlem sayardı. Sonuç: motorun
 * doğruluğu kendi tahminine karşı ölçülür, MAPE iyimser tarafa sapar ve bunu
 * fark edecek hiçbir mekanizma kalmaz.
 *
 * Üretimde HİÇ çalıştırılmamıştı — silmeden önce doğrulandı, canlı
 * `SELECT COUNT(*) FROM ilanlar WHERE ilan_no GLOB 'bl_*'` = 0. Bu test o
 * durumun korunması için.
 *
 * Ayrıntılı gerekçe: scripts/SENTETIK-ILAN-YASAGI.md
 */
import { describe, it, expect } from "vitest";
import { IlanIngestSchema } from "../src/lib/validation.js";

/** Şemayı geçen minimal geçerli bir ilan. */
function ilan(ekle: Record<string, unknown> = {}) {
  return {
    kaynak: "extension",
    ilanNo: "12345678",
    il: "Adana",
    ilce: "Pozantı",
    mahalle: "Yeni Konacık",
    fiyatPerM2: 3200,
    m2: 1000,
    ...ekle,
  };
}

describe("sentetik baseline ilanı reddi", () => {
  it("normal ilan numarası kabul edilir", () => {
    expect(IlanIngestSchema.safeParse(ilan()).success).toBe(true);
  });

  /**
   * Silinen üretecin ürettiği tam biçim:
   * `bl_istanbul__basaksehir__bogazkoy_arsa`
   */
  it("bl_ önekli ilan numarası REDDEDİLİR", () => {
    const r = IlanIngestSchema.safeParse(
      ilan({ ilanNo: "bl_istanbul__basaksehir__bogazkoy_arsa" }),
    );
    expect(r.success).toBe(false);
  });

  it("red gerekçesi kullanıcıya belgeyi işaret eder", () => {
    const r = IlanIngestSchema.safeParse(ilan({ ilanNo: "bl_adana__pozanti__x_arsa" }));
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(JSON.stringify(r.error.issues)).toContain("SENTETIK-ILAN-YASAGI");
    }
  });

  /**
   * Yasak `kaynak` alanına değil ilan numarasına bağlı: silinen üreteç
   * `extension` etiketi kullanıyordu ve o etiket meşru bir kaynak. Kaynağı
   * yasaklamak gerçek uzantı yakalamalarını da keserdi.
   */
  it("yasak kaynak alanına değil, ilan numarasına bağlı", () => {
    for (const k of ["extension", "emlakjet", "hepsiemlak", "sahibinden"]) {
      expect(IlanIngestSchema.safeParse(ilan({ kaynak: k })).success).toBe(true);
      expect(
        IlanIngestSchema.safeParse(ilan({ kaynak: k, ilanNo: "bl_x" })).success,
      ).toBe(false);
    }
  });

  /**
   * Dar kural: yalnızca ÖNEK yasak. İçinde "bl_" geçen ya da "bl" ile başlayan
   * meşru bir ilan numarası kesilmemeli — kaynak siteler bu biçimleri
   * kullanabilir ve gereğinden geniş bir yasak gerçek veri kaybettirir.
   */
  it("meşru numaraları kesmez", () => {
    for (const no of ["bl12345", "ej_bl_99", "BL_123", "blok_7"]) {
      expect(IlanIngestSchema.safeParse(ilan({ ilanNo: no })).success).toBe(true);
    }
  });
});
