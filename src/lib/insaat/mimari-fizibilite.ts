/**
 * 3D Parametrik Mimari Kütle, İnşaat Maliyeti & Hasılat Simülatörü.
 *
 * e-Plan imar parametrelerinden (TAKS, KAKS, Hmax, Kat Adedi)
 * arsa üzerine sığabilecek bina hacmini, üretilecek daire sayılarını,
 * 2026 ÇŞB birim maliyetleriyle toplam inşaat bütçesini,
 * beklenen brüt satış hasılatını ve müteahhit net kârlılık oranını hesaplar.
 */

export interface ImarFizibiliteGirdisi {
  parselAlaniM2: number;
  taks?: number; // Taban Alanı Katsayısı (Örn: 0.30 - 0.40)
  kaks?: number; // Kat Alanı Kat Sayısı / Emsal (Örn: 0.60 - 2.50)
  maksKat?: number; // Maksimum Kat Adedi (Örn: 4, 6, 8)
  yapiNizami?: "ayrik" | "bitisik" | "blok";
  ortalamaDaireNetM2?: number; // Standart: 100 m² (2+1/3+1 ortalaması)
  bolgeKonutSatisM2TL: number; // Bölgedeki taze konut satış m² fiyatı
  birimInsaatMaliyetiM2TL?: number; // 2026 ÇŞB III-B / IV-A standart lüks konut: 22.000 TL/m²
  katKarsiligiOraniYuzde?: number; // Arsa sahibine verilecek pay (Örn: %40 veya %50)
}

export interface DaireTipiDagilimi {
  tip: "1+1" | "2+1" | "3+1" | "4+1" | "ticari_dukkankat";
  adet: number;
  birimNetM2: number;
  toplamSatilabilirM2: number;
  tahminiDaireBirimFiyatiTL: number;
  toplamHasilatTL: number;
}

export interface MimariFizibiliteRaporu {
  imarMetraj: {
    tabanAlaniM2: number; // Parsel x TAKS
    toplamEmsalAlaniM2: number; // Parsel x KAKS
    toplamBrutInsaatAlaniM2: number; // Emsal x 1.30 (Otopark, sığınak, ortak alan dahil)
    toplamSatilabilirNetM2: number; // Daire iç net toplamı
    katAdedi: number;
    tabanKullanimOraniYuzde: number;
  };
  daireDagilimi: DaireTipiDagilimi[];
  toplamUretilenKonutAdedi: number;
  finansalAnaliz: {
    toplamInsaatMaliyetiTL: number; // Brüt alan x Birim inşaat maliyeti
    toplamSatisHasilatiTL: number; // Satılabilir net x Bölge m²
    brutProjeKariTL: number; // Hasılat - İnşaat Maliyeti
    arsaSahibineKalanDaireAdedi: number;
    arsaSahibiHasilatTL: number;
    muteahhitKalanDaireAdedi: number;
    muteahhitHasilatTL: number;
    muteahhitNetKariTL: number;
    muteahhitKariRoiYuzde: number; // Net Kâr / İnşaat Maliyeti
  };
  uygunlukOzeti: string;
}

export class MimariFizibiliteMotoru {
  // 2026 ÇŞB Referans Birim İnşaat Maliyetleri (TL / m² Brüt Yapı)
  private readonly STANDART_INSAAT_MALIYETI_TL_M2 = 22_000;

  /**
   * İmar ve finansal parametrelere göre uçtan uca mimari fizibilite raporu üretir.
   */
  public fizibiliteHesapla(girdi: ImarFizibiliteGirdisi): MimariFizibiliteRaporu {
    const taks = Math.min(0.60, Math.max(0.15, girdi.taks ?? 0.35));
    const kaks = Math.min(4.0, Math.max(0.20, girdi.kaks ?? 1.20));
    const maksKat = Math.max(1, Math.min(30, girdi.maksKat ?? Math.ceil(kaks / taks)));
    const daireNetM2 = girdi.ortalamaDaireNetM2 ?? 95;
    const birimInsaatMaliyet = girdi.birimInsaatMaliyetiM2TL ?? this.STANDART_INSAAT_MALIYETI_TL_M2;
    const katKarsiligi = Math.min(80, Math.max(20, girdi.katKarsiligiOraniYuzde ?? 45));

    // 1. İmar Metrajları
    const tabanAlaniM2 = Math.round(girdi.parselAlaniM2 * taks);
    const toplamEmsalAlaniM2 = Math.round(girdi.parselAlaniM2 * kaks);
    // İnşaat brüt alanı emsalin yaklaşık %30 fazlasıdır (balkon, otopark, yangın merdiveni, sığınak)
    const toplamBrutInsaatAlaniM2 = Math.round(toplamEmsalAlaniM2 * 1.30);
    // Satılabilir net alan emsalin yaklaşık %85'idir
    const toplamSatilabilirNetM2 = Math.round(toplamEmsalAlaniM2 * 0.85);

    // 2. Daire Dağılımı Simülasyonu
    const toplamKonutAdedi = Math.max(1, Math.floor(toplamSatilabilirNetM2 / daireNetM2));
    const daireBasiBirimFiyat = Math.round(daireNetM2 * girdi.bolgeKonutSatisM2TL);

    const daireDagilimi: DaireTipiDagilimi[] = [
      {
        tip: "2+1",
        adet: Math.round(toplamKonutAdedi * 0.6),
        birimNetM2: Math.round(daireNetM2 * 0.9),
        toplamSatilabilirM2: Math.round(toplamSatilabilirNetM2 * 0.55),
        tahminiDaireBirimFiyatiTL: Math.round(daireNetM2 * 0.9 * girdi.bolgeKonutSatisM2TL),
        toplamHasilatTL: Math.round(toplamSatilabilirNetM2 * 0.55 * girdi.bolgeKonutSatisM2TL),
      },
      {
        tip: "3+1",
        adet: Math.max(1, toplamKonutAdedi - Math.round(toplamKonutAdedi * 0.6)),
        birimNetM2: Math.round(daireNetM2 * 1.2),
        toplamSatilabilirM2: Math.round(toplamSatilabilirNetM2 * 0.45),
        tahminiDaireBirimFiyatiTL: Math.round(daireNetM2 * 1.2 * girdi.bolgeKonutSatisM2TL),
        toplamHasilatTL: Math.round(toplamSatilabilirNetM2 * 0.45 * girdi.bolgeKonutSatisM2TL),
      },
    ];

    // 3. Finansal Maliyet ve Hasılat
    const toplamInsaatMaliyetiTL = Math.round(toplamBrutInsaatAlaniM2 * birimInsaatMaliyet);
    const toplamSatisHasilatiTL = Math.round(toplamSatilabilirNetM2 * girdi.bolgeKonutSatisM2TL);
    const brutProjeKariTL = toplamSatisHasilatiTL - toplamInsaatMaliyetiTL;

    // Kat Karşılığı Paylaşımı
    const arsaSahibiDaireAdedi = Math.round(toplamKonutAdedi * (katKarsiligi / 100));
    const muteahhitDaireAdedi = Math.max(1, toplamKonutAdedi - arsaSahibiDaireAdedi);

    const arsaSahibiHasilatTL = Math.round(toplamSatisHasilatiTL * (katKarsiligi / 100));
    const muteahhitHasilatTL = toplamSatisHasilatiTL - arsaSahibiHasilatTL;
    const muteahhitNetKariTL = muteahhitHasilatTL - toplamInsaatMaliyetiTL;
    const muteahhitRoiYuzde = Number(((muteahhitNetKariTL / toplamInsaatMaliyetiTL) * 100).toFixed(1));

    // Özet Gerekçelendirme
    let uygunlukOzeti = "";
    if (muteahhitRoiYuzde >= 35) {
      uygunlukOzeti = `MÜKEMMEL PROJE FİZİBİLİTESİ: %${katKarsiligi} kat karşılığı paylaşımında müteahhide %${muteahhitRoiYuzde} net kâr (${muteahhitNetKariTL.toLocaleString("tr-TR")} ₺) kalmaktadır. İnşaat için çok cazip.`;
    } else if (muteahhitRoiYuzde >= 15) {
      uygunlukOzeti = `DENGELİ PROJE: Müteahhit kâr marjı %${muteahhitRoiYuzde} seviyesindedir. Standart piyasa koşullarında yapılabilir.`;
    } else {
      uygunlukOzeti = `DÜŞÜK KÂRLILIK RİSKİ: Kat karşılığı oranı (%${katKarsiligi}) mevcut konut satış fiyatlarına göre yüksek kalmaktadır. Arsa sahibi payı %35-40 bandına çekilmelidir.`;
    }

    return {
      imarMetraj: {
        tabanAlaniM2,
        toplamEmsalAlaniM2,
        toplamBrutInsaatAlaniM2,
        toplamSatilabilirNetM2,
        katAdedi: maksKat,
        tabanKullanimOraniYuzde: Number((taks * 100).toFixed(0)),
      },
      daireDagilimi,
      toplamUretilenKonutAdedi: toplamKonutAdedi,
      finansalAnaliz: {
        toplamInsaatMaliyetiTL,
        toplamSatisHasilatiTL,
        brutProjeKariTL,
        arsaSahibineKalanDaireAdedi: arsaSahibiDaireAdedi,
        arsaSahibiHasilatTL,
        muteahhitKalanDaireAdedi: muteahhitDaireAdedi,
        muteahhitHasilatTL,
        muteahhitNetKariTL,
        muteahhitKariRoiYuzde: muteahhitRoiYuzde,
      },
      uygunlukOzeti,
    };
  }
}