import { describe, it, expect } from "vitest";
import { guvenSkoruTavani, guvenHesapla, ekGuvenKatmani, type BolgeBaselineSonuc } from "../src/lib/fiyat/guven-motoru";

/**
 * Bu dosya eskiden sabitleri tek tek yeniden yazıyordu (`toBe(90)`), yani
 * hiçbir şey doğrulamıyordu: değeri değiştirmek testi de değiştirmek demekti.
 *
 * Artık ölçülen doğrulukla tutarlılığı kilitliyor. Referans: 2026-08-31
 * backtest koşumu (test/backtest/real-engine.spec.ts, n=2.400) — kaynak
 * bazlı ±%20 isabet ve bias tablosu guven-motoru.ts'in başında.
 */
describe("Fiyat: guven-motoru modülü", () => {
  it("gözleme dayanan kaynaklar, statik tablodan daha yüksek tavan alır", () => {
    expect(guvenSkoruTavani("ilanGozlem-mahalle")).toBeGreaterThan(
      guvenSkoruTavani("mahalle-baseline", "arsa"),
    );
    expect(guvenSkoruTavani("ilanGozlem-ilce")).toBeGreaterThan(
      guvenSkoruTavani("mahalle-baseline", "arsa"),
    );
    expect(guvenSkoruTavani("spatial-radius")).toBeGreaterThan(
      guvenSkoruTavani("mahalle-baseline", "arsa"),
    );
  });

  it("spatial-radius tavanı ilanGozlem-mahalle ile eşit ve yüksektir (98)", () => {
    expect(guvenSkoruTavani("spatial-radius")).toBe(98);
  });

  /**
   * Asıl regresyon koruması: statik tablo ARSA'da +%222 bias ölçtü.
   * Tavanı `ilanGozlem-ilce`nin (88) üstüne çıkarmak, ölçümle çelişen eski
   * hâle (90) geri dönmek olur.
   */
  it("statik mahalle tablosu arsada düşük tavanla sınırlanır", () => {
    const tavan = guvenSkoruTavani("mahalle-baseline", "arsa");
    expect(tavan).toBeLessThanOrEqual(50);
  });

  it("aynı kaynak tarlada arsadan daha güvenilir sayılır (ölçüm böyle diyor)", () => {
    expect(guvenSkoruTavani("mahalle-baseline", "tarla")).toBeGreaterThan(
      guvenSkoruTavani("mahalle-baseline", "arsa"),
    );
  });

  it("kategori verilmezse arsa (temkinli olan) varsayılır", () => {
    expect(guvenSkoruTavani("mahalle-baseline")).toBe(
      guvenSkoruTavani("mahalle-baseline", "arsa"),
    );
  });

  it("çözünürlük merdiveni monoton: mahalle > ilçe > il > fallback", () => {
    expect(guvenSkoruTavani("ilanGozlem-mahalle")).toBeGreaterThan(
      guvenSkoruTavani("ilanGozlem-ilce"),
    );
    expect(guvenSkoruTavani("ilce-baseline")).toBeGreaterThan(
      guvenSkoruTavani("il-baseline"),
    );
    expect(guvenSkoruTavani("il-baseline")).toBeGreaterThan(
      guvenSkoruTavani("fallback"),
    );
  });

  it("hiçbir kaynak %100 güven vaat etmez", () => {
    const hepsi = [
      "spatial-radius", "ilanGozlem-mahalle", "ilanGozlem-ilce",
      "mahalle-baseline", "ilce-semt-baseline", "ilce-baseline",
      "il-baseline", "fallback",
    ] as const;
    for (const k of hepsi) {
      expect(guvenSkoruTavani(k, "arsa")).toBeLessThan(100);
      expect(guvenSkoruTavani(k, "tarla")).toBeLessThan(100);
    }
  });

  describe("spatial-radius entegrasyonu", () => {
    const mockBaseline: BolgeBaselineSonuc = {
      baseline: 5000,
      kaynak: "spatial-radius",
      not: "Spatial test",
      guvenAdet: 5,
      veriKalitesiNotlari: [],
      emsalOzeti: {
        mahalleAdet: 5,
        ilceAdet: 0,
        ortalamaBenzerlik: 0.8,
        dogrulanabilirAdet: 4,
      },
      tazelikOzeti: {
        ortalamaYasGun: 20,
        son30Gun: 4,
        son90Gun: 5,
      },
      kategori: "arsa",
      emsalListesi: [],
    };

    it("guvenHesapla: spatial-radius kaynaklı baseline için doğru açıklama ve yüksek skor üretir", () => {
      const res = guvenHesapla({
        baseline: mockBaseline,
        cevreVar: true,
        egimVar: true,
        multiplierClamped: false,
        resmiImarVar: false,
      });

      expect(res.guvenAciklama).toContain("spatial (yarıçap) emsali");
      expect(res.guvenSkoru).toBeGreaterThan(70);
    });

    it("ekGuvenKatmani: spatial-radius için doğru kırılım etiketi ve baseline puanı (58) verir", () => {
      const res = ekGuvenKatmani({
        baseline: mockBaseline,
        cevreVar: true,
        egimVar: true,
        multiplierClamped: false,
        resmiImarVar: false,
        manuelImarVar: false,
        manuelImarDetayAdet: 0,
        manuelEmsalAdet: 0,
      });

      const spatialKirilim = res.guvenKirilimi.find((k) => k.etiket === "Spatial radius emsali");
      expect(spatialKirilim).toBeDefined();
      expect(spatialKirilim?.puan).toBe(58);
    });

    /**
     * P12 KAPISI — ölçülmemiş katman, ölçülmüşün üstüne çıkamaz.
     *
     * `ilanGozlem-mahalle` ölçülmüş durumda (±%20 30,9). `spatial-radius`'un
     * filtre SONRASI hâli ölçülmedi ve ölçülen tek şey (filtre öncesi) zarar
     * gösteriyordu: data/o1-spatial-katman-olcum.json.
     *
     * Bu test spatial'i yasaklamıyor — mahallenin ÜSTÜNE çıkmasını
     * yasaklıyor. Ölçüm gelirse eşitlik bilinçli olarak bozulabilir; o zaman
     * bu test ölçüm dosyasına atıfla güncellenir.
     *
     * MUTASYON: `guven-motoru.ts`'de spatial skorunu 62'ye geri al → bu test
     * kırılır.
     */
    it("P12: spatial-radius hiçbir yüzeyde ilanGozlem-mahalle'nin üstünde puan almaz", () => {
      /**
       * YALIN baseline — `mockBaseline` DEĞİL.
       *
       * mockBaseline emsal özeti, tazelik özeti ve bol bonus taşıyor; toplam
       * skor `clamp(…, 5, 95)` tavanına dayanıyor ve katman puanı arasındaki
       * fark GÖRÜNMEZ oluyordu. İlk yazımda test bu yüzden mutasyona duyarsızdı:
       * spatial 62'ye geri alındığında bile geçiyordu — yani kapı değil dekordu.
       *
       * Burada bonuslar kapalı, böylece iki kol arasındaki tek fark katman
       * puanının kendisi.
       */
      const yalin: BolgeBaselineSonuc = {
        baseline: 5000,
        kaynak: "spatial-radius",
        not: "P12 yalın",
        guvenAdet: 0,
        veriKalitesiNotlari: [],
        kategori: "arsa",
        emsalListesi: [],
      };
      const mahalleBaseline: BolgeBaselineSonuc = {
        ...yalin,
        kaynak: "ilanGozlem-mahalle",
      };
      const param = {
        cevreVar: false,
        egimVar: false,
        multiplierClamped: false,
        resmiImarVar: false,
      };

      // 1. Güven tavanı
      expect(guvenSkoruTavani("spatial-radius"))
        .toBeLessThanOrEqual(guvenSkoruTavani("ilanGozlem-mahalle"));

      // 2. guvenHesapla taban skoru — tek fark `kaynak`, o yüzden aradaki
      //    her fark doğrudan katman puanından geliyor.
      const sSpatial = guvenHesapla({ ...param, baseline: yalin }).guvenSkoru;
      const sMahalle = guvenHesapla({ ...param, baseline: mahalleBaseline }).guvenSkoru;
      // Tavana dayanmadıklarını doğrula — yoksa karşılaştırma anlamsız olur.
      expect(sSpatial).toBeLessThan(95);
      expect(sSpatial).toBeLessThanOrEqual(sMahalle);

      // 3. ekGuvenKatmani kırılım puanı
      const puan = (b: BolgeBaselineSonuc, etiket: string) =>
        ekGuvenKatmani({ ...param, baseline: b }).guvenKirilimi
          .find((k) => k.etiket === etiket)?.puan ?? 0;
      expect(puan(yalin, "Spatial radius emsali"))
        .toBeLessThanOrEqual(puan(mahalleBaseline, "Mahalle emsali"));
    });
  });
});

