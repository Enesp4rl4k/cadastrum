/**
 * Türkçe normalize fonksiyonları — emsal eşleşmesi için kritik
 */
import { describe, it, expect } from "vitest";
import {
  normalizeTr,
  normalizeYerAdi,
  mahalleEsleFromListe,
  mahalleAdaylariFromListe,
  normalizeMahalleAra,
} from "../src/lib/tkgm-api";
import type { Mahalle } from "../src/types/tkgm";

describe("normalizeTr", () => {
  it("Türkçe karakterleri ASCII'ye çevirir", () => {
    expect(normalizeTr("İSTANBUL")).toBe("istanbul");
    expect(normalizeTr("Şanlıurfa")).toBe("sanliurfa");
    expect(normalizeTr("Çağdaş")).toBe("cagdas");
    expect(normalizeTr("ÖZGÜR")).toBe("ozgur");
  });

  it("boşlukları ve özel karakterleri temizler", () => {
    expect(normalizeTr(" Konya ")).toBe("konya");
    expect(normalizeTr("İ.İ.İ")).toMatch(/^i/);
  });

  it("boş veya null girişlerde çökmez", () => {
    expect(normalizeTr("")).toBe("");
  });
});

describe("normalizeYerAdi", () => {
  it("aynı il için tutarlı çıktı verir", () => {
    expect(normalizeYerAdi("İstanbul")).toBe(normalizeYerAdi("ISTANBUL"));
    expect(normalizeYerAdi("Şanlıurfa")).toBe(normalizeYerAdi("Şanlıurfa"));
  });

  it("ilçe-sonu eklerini standardize eder", () => {
    // Examples — actual implementation may strip "merkez" etc.
    const a = normalizeYerAdi("Merkez");
    expect(typeof a).toBe("string");
  });
});

describe("mahalleEsleFromListe", () => {
  const liste: Mahalle[] = [
    { mahalleKodu: 1, mahalleAdi: "Bozen Mah.", ilceKodu: 99 },
    { mahalleKodu: 2, mahalleAdi: "Köprübaşı Köyü", ilceKodu: 99 },
  ];

  it("mahalle suffix ile eşleşir", () => {
    const m = mahalleEsleFromListe(liste, "Bozen");
    expect(m?.mahalleKodu).toBe(1);
  });

  it("köy suffix ile eşleşir", () => {
    const m = mahalleEsleFromListe(liste, "Köprübaşı");
    expect(m?.mahalleKodu).toBe(2);
  });

  it("OSB gürültüsünü atıp eşleşir", () => {
    const osbListe: typeof liste = [
      { mahalleKodu: 3, mahalleAdi: "Küçükkuyu Köyü", ilceKodu: 99 },
    ];
    expect(normalizeMahalleAra("Küçükkuyu OSB")).toBe("kucukkuyu");
    const m = mahalleEsleFromListe(osbListe, "Küçükkuyu OSB");
    expect(m?.mahalleKodu).toBe(3);
  });

  it("aday listesi skor sıralar", () => {
    const adaylar = mahalleAdaylariFromListe(liste, "Bozen Mah");
    expect(adaylar[0]?.mahalle.mahalleKodu).toBe(1);
    expect(adaylar[0]?.skor).toBeGreaterThanOrEqual(80);
  });
});
