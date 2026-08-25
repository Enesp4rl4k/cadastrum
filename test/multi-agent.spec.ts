import { describe, it, expect } from "vitest";
import { HukukImarAjani } from "../src/lib/ajanlar/hukuk-imar-ajani";
import { FirsatAvcisiAjani } from "../src/lib/ajanlar/firsat-avcisi-ajani";
import { MultiAgentOrkestrator } from "../src/lib/ajanlar/multi-agent-orkestrator";
import type { ParselSorguGirdisi } from "../src/lib/ajanlar/ajan-tipleri";

describe("Çoklu Otonom Ajan Sistemi (Multi-Agent RAG)", () => {
  it("HukukImarAjani hisseli küçük tarla ve zeytinlik risklerini doğru tespit eder", () => {
    const ajan = new HukukImarAjani();
    const parsel: ParselSorguGirdisi = {
      il: "balikesir",
      ilce: "edremit",
      kategori: "tarla",
      alanM2: 8_000,
      hisseliMi: true,
      zeytinlikMi: true,
    };

    const rapor = ajan.denetle(parsel);
    expect(rapor.riskSeviyesi).toBe("yuksek");
    expect(rapor.riskSkoru).toBeGreaterThan(50);
    expect(rapor.tespitEdilenRiskler.length).toBeGreaterThanOrEqual(2);
    expect(rapor.ilgiliMevzuat.some((m) => m.kanunNo === "5403")).toBe(true);
    expect(rapor.ilgiliMevzuat.some((m) => m.kanunNo === "3573")).toBe(true);
  });

  it("FirsatAvcisiAjani kelepir ilanları doğru puanlar", () => {
    const ajan = new FirsatAvcisiAjani();
    const parsel: ParselSorguGirdisi = {
      il: "izmir",
      ilce: "urla",
      kategori: "arsa",
      alanM2: 500,
      ilanFiyatiTL: 2_000_000,
    };

    // Piyasa değeri 3.5M TL, ilan 2.0M TL -> %42.9 ucuz
    const rapor = ajan.analizEt(parsel, 3_500_000);
    expect(rapor.kelepirMi).toBe(true);
    expect(rapor.iskontoOraniYuzde).toBeGreaterThan(40);
    expect(rapor.firsatPuani).toBeGreaterThan(75);
    expect(rapor.potansiyelKarTL).toBe(1_500_000);
  });

  it("MultiAgentOrkestrator tüm ajanları sentezleyip genel karar üretir", async () => {
    const orkestrator = new MultiAgentOrkestrator();
    const parsel: ParselSorguGirdisi = {
      il: "istanbul",
      ilce: "beykoz",
      mahalle: "gorele",
      kategori: "arsa",
      alanM2: 1000,
      ilanFiyatiTL: 5_000_000,
      imarDurumu: "konut-imarli",
    };

    const sentez = await orkestrator.analizEt(parsel);
    expect(sentez.degerleme).toBeDefined();
    expect(sentez.hukuk).toBeDefined();
    expect(sentez.firsat).toBeDefined();
    expect(sentez.ajanLoglari.length).toBeGreaterThanOrEqual(4);
    expect(["guclu-al", "al", "tut-incele", "uzak-dur"]).toContain(sentez.genelKarar);
    expect(sentez.nihaiTavsiye.length).toBeGreaterThan(20);
  });
});