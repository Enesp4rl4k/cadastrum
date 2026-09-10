/**
 * Ölçüm bütünlüğü kapılarının kendi testleri — P8, P9, P11.
 *
 * NEDEN NORMAL SUIT'TE: kapılar `test/backtest/` altında yaşıyor ama oranın
 * koşumu ~100 saniye sürüyor. Bir kapının bozulduğunu 100 saniyede öğrenmek,
 * hiç öğrenmemekle arasında pratikte fark az. Kapılar saf fonksiyon olduğu
 * için buradan milisaniyede sınanabiliyor.
 *
 * Bu dosya kapının KENDİSİNİ sınıyor: alarm gerçekten çalıyor mu, yoksa
 * yalnızca duruyor mu? Konut backtest'i vakası tam olarak buydu — kapı vardı,
 * yeşil geçiyordu, ölçmüyordu.
 */

import { describe, it, expect } from "vitest";
import {
  sizintiDenetle,
  esikGirdisiDogrula,
  SIZINTI_SINIRLARI,
} from "./backtest/olcum-butunlugu";

describe("P9 — sızıntı alarmı", () => {
  it("gerçek ölçüm değerlerinde susar (yanlış alarm vermez)", () => {
    // 2026-09-08 gerçek koşumu: arsa ve tarla.
    expect(() =>
      sizintiDenetle("arsa", { n: 1200, medyanApe: 39.54, within10: 13 }),
    ).not.toThrow();
    expect(() =>
      sizintiDenetle("tarla", { n: 1200, medyanApe: 27.8, within10: 23.1 }),
    ).not.toThrow();
    // En iyi alt kova (tarla, "emsal yok") — kapıya en yakın gerçek sayı.
    expect(() =>
      sizintiDenetle("tarla/emsal yok", { n: 181, medyanApe: 16.04, within10: 30 }),
    ).not.toThrow();
  });

  it("konut backtest'inin sayılarında ALARM VERİR", () => {
    // data/konut-backtest-sizinti.json — kapı bu sayıyı reddetmeliydi.
    expect(() =>
      sizintiDenetle("konut", { n: 1206, medyanApe: 0, within10: 63.4 }),
    ).toThrow(/SIZINTI ŞÜPHESİ/);
  });

  it("hata mesajı sebebi ve n'i söyler — 'bir yerde hata var' yetmez", () => {
    let mesaj = "";
    try {
      sizintiDenetle("konut", { n: 1206, medyanApe: 0, within10: 63.4 });
    } catch (e) {
      mesaj = (e as Error).message;
    }
    expect(mesaj).toContain("konut");
    expect(mesaj).toContain("n=1206");
    expect(mesaj).toContain("medyan APE");
    expect(mesaj).toContain("±%10 isabeti");
  });

  it("iki sınır BAĞIMSIZ çalışır — biri tek başına yeter", () => {
    // Yalnızca medyan APE düşük
    expect(() =>
      sizintiDenetle("a", { n: 500, medyanApe: 1, within10: 10 }),
    ).toThrow(/SIZINTI ŞÜPHESİ/);
    // Yalnızca within10 yüksek
    expect(() =>
      sizintiDenetle("b", { n: 500, medyanApe: 30, within10: 80 }),
    ).toThrow(/SIZINTI ŞÜPHESİ/);
  });

  it("küçük n'de susar — 3 kayıtlık kovanın mükemmel skoru gürültüdür", () => {
    expect(() =>
      sizintiDenetle("küçük kova", {
        n: SIZINTI_SINIRLARI.MIN_N - 1,
        medyanApe: 0,
        within10: 100,
      }),
    ).not.toThrow();
  });
});

describe("P8/P11 — eşik künyesi", () => {
  it("gözleme dayanan kaynakları kabul eder", () => {
    expect(() =>
      esikGirdisiDogrula("arsa", { gercek_kaynagi: "ilan", olculdu: "2026-09-08", n: 1200 }),
    ).not.toThrow();
    expect(() =>
      esikGirdisiDogrula("arsa", { gercek_kaynagi: "gercek-satis", olculdu: "x", n: 300 }),
    ).not.toThrow();
  });

  it("TÜRETİLMİŞ kaynağı reddeder — konut eşiği bu kapıdan geçemezdi", () => {
    expect(() =>
      esikGirdisiDogrula("konut", { gercek_kaynagi: "turetilmis", olculdu: "x", n: 1206 }),
    ).toThrow(/TÜRETİLMİŞ VERİ EŞİĞE YAZILAMAZ/);
  });

  it("künyesiz girdiyi reddeder — sessizce kabul etmek boşluğun ta kendisiydi", () => {
    expect(() => esikGirdisiDogrula("arsa", {})).toThrow(/EŞİK KÜNYESİZ/);
  });
});

describe("Eşik dosyasının kendisi kapıdan geçiyor", () => {
  it("data/backtest-esik-real.json'daki her girdi künyeli ve ölçülebilir kaynaklı", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const dosya = join(__dirname, "..", "data", "backtest-esik-real.json");
    const { esikler } = JSON.parse(readFileSync(dosya, "utf8"));

    const segmentler = Object.keys(esikler);
    expect(segmentler.length).toBeGreaterThan(0);
    for (const segment of segmentler) {
      expect(() => esikGirdisiDogrula(segment, esikler[segment])).not.toThrow();
    }
  });

  it("konut eşiği dosyadan çıkarılmış durumda", () => {
    // Geri gelirse bu test kırılır — çıkarma kararı kalıcı olsun diye.
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const { join } = require("node:path") as typeof import("node:path");
    const dosya = join(__dirname, "..", "data", "backtest-esik-real.json");
    const { esikler } = JSON.parse(readFileSync(dosya, "utf8"));
    expect(esikler.konut).toBeUndefined();
  });
});
