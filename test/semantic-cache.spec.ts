import { describe, it, expect } from "vitest";
import { SemanticCache } from "../src/lib/rag/semantic-cache";

describe("Semantic Cache Engine", () => {
  it("Aynı veya çok benzer sorguları semantik önbellekten döner", () => {
    const cache = new SemanticCache<{ sonuc: string }>({ benzerlikEsigi: 0.90 });

    cache.kaydet("Urla Kekliktepe satılık imarlı arsa", { sonuc: "Urla verisi" });

    // Özdeş sorgu -> HIT
    const hit1 = cache.getir("Urla Kekliktepe satılık imarlı arsa");
    expect(hit1).not.toBeNull();
    expect(hit1?.veri.sonuc).toBe("Urla verisi");
    expect(hit1?.benzerlik).toBeGreaterThan(0.98);

    // Tamamen farklı sorgu -> MISS
    const miss = cache.getir("Trabzon Yomra fındık bahçesi");
    expect(miss).toBeNull();

    const stats = cache.istatistik();
    expect(stats.hitSayisi).toBe(1);
    expect(stats.missSayisi).toBe(1);
    expect(stats.hitOraniYuzde).toBe(50);
  });
});