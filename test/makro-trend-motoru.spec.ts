import { describe, it, expect } from "vitest";
import { MakroTrendMotoru } from "../src/lib/tahmin/makro-trend-motoru";

describe("Makroekonomik Trend & Fiyat Projeksiyon Motoru (FAZ 3)", () => {
  const trendMotoru = new MakroTrendMotoru();

  it("İzmir arsa için 6 ve 12 aylık reel getiri projeksiyonunu hesaplar", () => {
    const sonuc = trendMotoru.projeksiyonHesapla("izmir", "arsa", 5_000_000);

    expect(sonuc.altiAylikProjeksiyon.tahminiFiyatTL).toBeGreaterThan(5_000_000);
    expect(sonuc.onIkiAylikProjeksiyon.tahminiFiyatTL).toBeGreaterThan(sonuc.altiAylikProjeksiyon.tahminiFiyatTL);
    expect(sonuc.onIkiAylikProjeksiyon.nominalArtisYuzde).toBeGreaterThan(30);
    expect(sonuc.onIkiAylikProjeksiyon.reelGetiriYuzde).toBeDefined();
    expect(sonuc.makroYorumu).toContain("İZMİR");
  });
});