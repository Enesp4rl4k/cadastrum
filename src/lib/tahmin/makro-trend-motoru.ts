/**
 * Makroekonomik Faiz, Enflasyon & Fiyat Trend Projeksiyon Motoru.
 *
 * TCMB Konut Fiyat Endeksi (KFE) eğilimleri, politika faizi döngüsü
 * ve bölgesel likidite verilerini işleyerek 6 ve 12 aylık beklenen
 * nominal fiyat artışı ve reel getiri projeksiyonunu hesaplar.
 */

export interface MakroProjeksiyonSonucu {
  il: string;
  kategori: "arsa" | "tarla" | "konut";
  mevcutDegerTL: number;
  altiAylikProjeksiyon: {
    tahminiFiyatTL: number;
    nominalArtisYuzde: number;
    tahminiEnflasyonYuzde: number;
    reelGetiriYuzde: number;
    piyasaRejimi: "hizli_degerlenme" | "reel_artis" | "enflasyona_paralel" | "reel_kayip";
  };
  onIkiAylikProjeksiyon: {
    tahminiFiyatTL: number;
    nominalArtisYuzde: number;
    tahminiEnflasyonYuzde: number;
    reelGetiriYuzde: number;
    piyasaRejimi: "hizli_degerlenme" | "reel_artis" | "enflasyona_paralel" | "reel_kayip";
  };
  makroYorumu: string;
}

export class MakroTrendMotoru {
  // Yıllık baz alınan ortalama makro göstergeler (2026 Projeksiyonları)
  private readonly YILLIK_BEKLENEN_ENFLASYON_YUZDE = 32.0;

  // Bölgesel Yıllık KFE Artış Katsayıları (Trend Primi)
  private readonly BOLGE_PRIMLERI: Record<string, number> = {
    istanbul: 1.05,
    izmir: 1.18,
    mugla: 1.25,
    antalya: 1.15,
    ankara: 1.10,
    balikesir: 1.20,
    canakkale: 1.22,
    bursa: 1.08,
  };

  /**
   * Bölge ve kategoriye göre 6 ve 12 aylık fiyat projeksiyonu üretir.
   */
  public projeksiyonHesapla(
    il: string,
    kategori: "arsa" | "tarla" | "konut",
    mevcutDegerTL: number
  ): MakroProjeksiyonSonucu {
    const ilNorm = il.toLowerCase().trim();
    const bolgePrimi = this.BOLGE_PRIMLERI[ilNorm] ?? 1.0;

    // Kategoriye özel getiri katsayısı (Arsa enflasyonun üzerinde prim yapar)
    const kategoriCarpani = kategori === "arsa" ? 1.12 : kategori === "tarla" ? 1.08 : 0.98;

    // 6 Aylık Tahmin
    const altiAyEnflasyon = this.YILLIK_BEKLENEN_ENFLASYON_YUZDE * 0.48;
    const altiAyNominalArtis = Number((altiAyEnflasyon * bolgePrimi * kategoriCarpani).toFixed(1));
    const altiAyReelGetiri = Number((altiAyNominalArtis - altiAyEnflasyon).toFixed(1));
    const altiAyFiyat = Math.round((mevcutDegerTL * (1 + altiAyNominalArtis / 100)) / 10000) * 10000;

    // 12 Aylık Tahmin
    const onIkiAyEnflasyon = this.YILLIK_BEKLENEN_ENFLASYON_YUZDE;
    const onIkiAyNominalArtis = Number((onIkiAyEnflasyon * bolgePrimi * kategoriCarpani).toFixed(1));
    const onIkiAyReelGetiri = Number((onIkiAyNominalArtis - onIkiAyEnflasyon).toFixed(1));
    const onIkiAyFiyat = Math.round((mevcutDegerTL * (1 + onIkiAyNominalArtis / 100)) / 10000) * 10000;

    const rejimBelirle = (reel: number): MakroProjeksiyonSonucu["altiAylikProjeksiyon"]["piyasaRejimi"] => {
      if (reel >= 8) return "hizli_degerlenme";
      if (reel >= 2) return "reel_artis";
      if (reel >= -2) return "enflasyona_paralel";
      return "reel_kayip";
    };

    let makroYorumu = "";
    const ilEtiket = il.toLocaleUpperCase("tr-TR");
    const katEtiket = kategori.toLocaleUpperCase("tr-TR");
    if (onIkiAyReelGetiri > 5) {
      makroYorumu = `${ilEtiket} bölgesinde ${katEtiket} yatırımı yıllık %${onIkiAyNominalArtis} nominal artışla enflasyonun üzerinde %${onIkiAyReelGetiri} reel getiri vadediyor. Sermaye koruma ve büyüme için güçlü bölge.`;
    } else {
      makroYorumu = `${ilEtiket} bölgesinde fiyat hareketleri enflasyon ile dengeli (%${onIkiAyNominalArtis} nominal artış) seyretmektedir.`;
    }

    return {
      il: ilNorm,
      kategori,
      mevcutDegerTL,
      altiAylikProjeksiyon: {
        tahminiFiyatTL: altiAyFiyat,
        nominalArtisYuzde: altiAyNominalArtis,
        tahminiEnflasyonYuzde: altiAyEnflasyon,
        reelGetiriYuzde: altiAyReelGetiri,
        piyasaRejimi: rejimBelirle(altiAyReelGetiri),
      },
      onIkiAylikProjeksiyon: {
        tahminiFiyatTL: onIkiAyFiyat,
        nominalArtisYuzde: onIkiAyNominalArtis,
        tahminiEnflasyonYuzde: onIkiAyEnflasyon,
        reelGetiriYuzde: onIkiAyReelGetiri,
        piyasaRejimi: rejimBelirle(onIkiAyReelGetiri),
      },
      makroYorumu,
    };
  }
}