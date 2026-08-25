import { describe, it, expect } from "vitest";
import { MultiAgentDebateProtokolu } from "../src/lib/ajanlar/debate-protokolu";
import type { ParselSorguGirdisi, HukukDenetimRaporu, FirsatAnalizRaporu } from "../src/lib/ajanlar/ajan-tipleri";

describe("Multi-Agent Debate: Ajanlar Arası Münazara & Konsensüs", () => {
  const engine = new MultiAgentDebateProtokolu();

  it("Hukuki risk yüksek olduğunda münazara hakemi 'kesin-red' konsensüsü üretir", () => {
    const parsel: ParselSorguGirdisi = {
      il: "mugla",
      ilce: "bodrum",
      kategori: "arsa",
      alanM2: 1000,
    };

    const hukuk: HukukDenetimRaporu = {
      riskSeviyesi: "yuksek",
      riskSkoru: 75,
      tespitEdilenRiskler: [
        { baslik: "SİT Alanı", aciklama: "1. Derece Doğal SİT", ilgiliKanun: "2863", oneri: "Almayın" },
      ],
      ilgiliMevzuat: [],
      ozetHukukiGorus: "Yüksek risk",
    };

    const firsat: FirsatAnalizRaporu = {
      kelepirMi: true,
      iskontoOraniYuzde: 40,
      tahminiPiyasaDegeriTL: 10_000_000,
      ilanFiyatiTL: 6_000_000,
      firsatPuani: 85,
      potansiyelKarTL: 4_000_000,
      firsatGerekcesi: "Kelepir",
      riskFaktorleri: [],
    };

    const debate = engine.munazaraYurut(parsel, hukuk, firsat);

    expect(debate.turlar.length).toBe(3); // Fırsat + Hukuk + Hakem
    expect(debate.konsensusKarari).toBe("kesin-red");
    expect(debate.efektifFirsatPuani).toBeLessThan(30); // Risk çarpanı düşürdü
    expect(debate.aksiyonMaddeleri.length).toBeGreaterThan(0);
  });

  it("Hukuk temiz ve kelepir olduğunda 'guclu-al' konsensüsü üretir", () => {
    const parsel: ParselSorguGirdisi = {
      il: "ankara",
      ilce: "cankaya",
      kategori: "arsa",
      alanM2: 500,
    };

    const hukuk: HukukDenetimRaporu = {
      riskSeviyesi: "temiz",
      riskSkoru: 0,
      tespitEdilenRiskler: [],
      ilgiliMevzuat: [],
      ozetHukukiGorus: "Temiz",
    };

    const firsat: FirsatAnalizRaporu = {
      kelepirMi: true,
      iskontoOraniYuzde: 30,
      tahminiPiyasaDegeriTL: 5_000_000,
      ilanFiyatiTL: 3_500_000,
      firsatPuani: 80,
      potansiyelKarTL: 1_500_000,
      firsatGerekcesi: "Kelepir",
      riskFaktorleri: [],
    };

    const debate = engine.munazaraYurut(parsel, hukuk, firsat);
    expect(debate.konsensusKarari).toBe("guclu-al");
    expect(debate.efektifFirsatPuani).toBe(80);
  });
});