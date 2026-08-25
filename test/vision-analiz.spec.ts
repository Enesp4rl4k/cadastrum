import { describe, it, expect } from "vitest";
import { VisionKusurAnalizMotoru } from "../src/lib/vision/ilan-gorsel-analiz";

describe("Vision AI: Uydu & İlan Fotoğraflarından Otomatik Kusur Tespiti", () => {
  const motor = new VisionKusurAnalizMotoru();

  it("Yüksek gerilim hattı ve yolsuzluğu doğru tespit edip değer kaybı hesaplar", () => {
    const sonuc = motor.analizEt({
      fotoEtiketleri: ["direk", "tarla"],
      aciklamaMetni: "Arazi başında yüksek gerilim hattı geçiyor, yolu açılmamış.",
      uyduGoruntuAnalizi: {
        yolGorunuyorMu: false,
        direkDireklerVarMi: true,
      },
    });

    expect(sonuc.tespitEdilenKusurlar.length).toBe(2);
    expect(sonuc.tespitEdilenKusurlar.some((k) => k.kusurTipi === "yuksek_gerilim_hatti")).toBe(true);
    expect(sonuc.tespitEdilenKusurlar.some((k) => k.kusurTipi === "yol_yok")).toBe(true);
    expect(sonuc.toplamDegerKaybiYuzde).toBeGreaterThanOrEqual(30);
    expect(sonuc.fiiliYolDurumu).toBe("fiilen_yol_yok");
  });

  it("Kusursuz ve lüks konutta sıfır kusur ve yüksek kalite puanı verir", () => {
    const sonuc = motor.analizEt({
      aciklamaMetni: "Lüks sıfır daire, özel yapım mutfak ve ebeveyn banyolu.",
    });

    expect(sonuc.tespitEdilenKusurlar.length).toBe(0);
    expect(sonuc.toplamDegerKaybiYuzde).toBe(0);
    expect(sonuc.gorselKalitePuani).toBe(100);
    expect(sonuc.konutKondisyonu).toBe("luks_yenilenmis");
  });
});