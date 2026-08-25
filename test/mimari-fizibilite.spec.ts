import { describe, it, expect } from "vitest";
import {
  MimariFizibiliteMotoru,
  type ImarFizibiliteGirdisi,
} from "../src/lib/insaat/mimari-fizibilite";

describe("Mimari Kütle & İnşaat Fizibilite Motoru (FAZ 1)", () => {
  const motor = new MimariFizibiliteMotoru();

  it("1000 m² arsa için TAKS/KAKS ve kat karşılığı kârlılığını doğru hesaplar", () => {
    const girdi: ImarFizibiliteGirdisi = {
      parselAlaniM2: 1000,
      taks: 0.35,
      kaks: 1.40,
      maksKat: 4,
      bolgeKonutSatisM2TL: 45_000,
      katKarsiligiOraniYuzde: 45,
    };

    const rapor = motor.fizibiliteHesapla(girdi);

    // Metraj doğrulamaları
    expect(rapor.imarMetraj.tabanAlaniM2).toBe(350);
    expect(rapor.imarMetraj.toplamEmsalAlaniM2).toBe(1400);
    expect(rapor.imarMetraj.toplamBrutInsaatAlaniM2).toBe(1820);
    expect(rapor.toplamUretilenKonutAdedi).toBeGreaterThanOrEqual(10);

    // Finansal doğrulamalar
    expect(rapor.finansalAnaliz.toplamInsaatMaliyetiTL).toBeGreaterThan(30_000_000);
    expect(rapor.finansalAnaliz.toplamSatisHasilatiTL).toBeGreaterThan(50_000_000);
    expect(rapor.finansalAnaliz.brutProjeKariTL).toBeGreaterThan(10_000_000);
    expect(rapor.finansalAnaliz.muteahhitKalanDaireAdedi).toBeGreaterThan(0);
    expect(rapor.finansalAnaliz.arsaSahibineKalanDaireAdedi).toBeGreaterThan(0);
    expect(rapor.finansalAnaliz.muteahhitKariRoiYuzde).toBeDefined();
  });
});