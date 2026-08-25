/**
 * Konut Değerleme, Kira Amortismanı & Kentsel Dönüşüm Motoru.
 *
 * Prensip:
 *   1. Gelir İndirgeme / Brüt Kira Çarpanı (GRM / Cap Rate)
 *   2. Bina Yaşı & Deprem Yönetmeliği Çarpanı
 *   3. Kat Konumu & Cephe İskontosu
 *   4. Kentsel Dönüşüm "Gizli Arsa Payı" Değerlemesi
 */

export interface KonutGirdisi {
  il: string;
  ilce: string;
  mahalle?: string;
  brutM2: number;
  netM2?: number;
  odaSayisi?: string; // "2+1", "3+1", "1+1"
  binaYasi: number; // Yıl
  bulunduguKat: "kot" | "zemin" | "ara_kat" | "en_ust" | "dubleks";
  siteIciMi?: boolean;
  binaToplamKat?: number;
  parselAlaniM2?: number;
  binadakiToplamDaire?: number;
  talepEdilenFiyatTL?: number;
  tahminiAylikKiraTL?: number;
}

export interface KonutDeğerlemeSonucu {
  tahminiPiyasaDegeriTL: number;
  tahminiM2FiyatiTL: number;
  degerlemeAraligi: {
    altTL: number;
    ustTL: number;
  };
  amortismanAnalizi: {
    tahminiAylikKiraTL: number;
    yillikBrutKiraTL: number;
    amortismanYili: number;
    kiraVerimiYuzde: number;
    nakitAkisiSinifi: "mukemmel" | "iyi" | "normal" | "dusuk";
  };
  kentselDonusumAnalizi?: {
    daireBasiArsaPayiM2: number;
    tahminiArsaPayiDegeriTL: number;
    donusumPrimPotansiyeliYuzde: number;
    donusumFirsatiVarMi: boolean;
  };
  carpanlar: Array<{ ad: string; carpan: number; aciklama: string }>;
  yatirimOzeti: string;
}

export class KonutDegerlemeEngine {
  /**
   * Konut için detaylı piyasa değeri, kira getirisi ve amortisman süresi hesaplar.
   */
  public degerle(girdi: KonutGirdisi, bolgeKonutM2Baseline = 35_000): KonutDeğerlemeSonucu {
    const netM2 = girdi.netM2 ?? Math.round(girdi.brutM2 * 0.82); // Standart %18 brüt/net kaybı
    const carpanlar: Array<{ ad: string; carpan: number; aciklama: string }> = [];

    // 1. Kat Çarpanı
    let katCarpani = 1.0;
    let katNot = "Ara kat (Standart baz)";
    if (girdi.bulunduguKat === "kot") {
      katCarpani = 0.80;
      katNot = "Kot/Bodrum katı (%20 iskonto)";
    } else if (girdi.bulunduguKat === "zemin") {
      katCarpani = 0.90;
      katNot = "Giriş/Zemin kat (%10 iskonto)";
    } else if (girdi.bulunduguKat === "ara_kat") {
      katCarpani = 1.08;
      katNot = "Tercih edilen ara kat (+%8 prim)";
    } else if (girdi.bulunduguKat === "dubleks") {
      katCarpani = 1.12;
      katNot = "Çatı/Bahçe Dubleksi (+%12 prim)";
    }
    carpanlar.push({ ad: "Kat Konumu", carpan: katCarpani, aciklama: katNot });

    // 2. Bina Yaşı Çarpanı (2000 Deprem Yönetmeliği Kırılımı)
    let yasCarpani = 1.0;
    let yasNot = "";
    if (girdi.binaYasi === 0) {
      yasCarpani = 1.25;
      yasNot = "Sıfır bina (+%25 yeni yapı primi)";
    } else if (girdi.binaYasi <= 5) {
      yasCarpani = 1.15;
      yasNot = "Genç bina (1-5 yaş, +%15 prim)";
    } else if (girdi.binaYasi <= 15) {
      yasCarpani = 1.02;
      yasNot = "Standart yeni yönetmelik binası";
    } else if (girdi.binaYasi <= 25) {
      yasCarpani = 0.88;
      yasNot = "16-25 yaş binası (-%12 yaş yıpranması)";
    } else {
      yasCarpani = 0.75;
      yasNot = "2000 öncesi eski yapı (-%25 yıpranma & deprem riski)";
    }
    carpanlar.push({ ad: "Bina Yaşı", carpan: yasCarpani, aciklama: yasNot });

    // 3. Site İçi Çarpanı
    if (girdi.siteIciMi) {
      carpanlar.push({ ad: "Site İçi", carpan: 1.15, aciklama: "Güvenlik, otopark, sosyal tesis primi (+%15)" });
    }

    // Toplam Çarpan Hesabı (Log Damped)
    const toplamCarpan = katCarpani * yasCarpani * (girdi.siteIciMi ? 1.15 : 1.0);
    const birimM2Fiyati = Math.round(bolgeKonutM2Baseline * toplamCarpan);
    const tahminiPiyasaDegeri = Math.round(birimM2Fiyati * netM2);

    // Değerleme Bandı (+-%10)
    const altTL = Math.round(tahminiPiyasaDegeri * 0.90 / 10000) * 10000;
    const ustTL = Math.round(tahminiPiyasaDegeri * 1.10 / 10000) * 10000;
    const beklenenTL = Math.round(tahminiPiyasaDegeri / 10000) * 10000;

    // 4. Kira & Amortisman Analizi
    const aylikKira = girdi.tahminiAylikKiraTL ?? Math.round(beklenenTL / (19 * 12)); // Türkiye 19 yıl ortalaması
    const yillikBrutKira = aylikKira * 12;
    const amortismanYili = Number((beklenenTL / yillikBrutKira).toFixed(1));
    const kiraVerimi = Number(((yillikBrutKira / beklenenTL) * 100).toFixed(2));

    let nakitAkisiSinifi: KonutDeğerlemeSonucu["amortismanAnalizi"]["nakitAkisiSinifi"] = "normal";
    if (amortismanYili <= 14) nakitAkisiSinifi = "mukemmel";
    else if (amortismanYili <= 17) nakitAkisiSinifi = "iyi";
    else if (amortismanYili <= 22) nakitAkisiSinifi = "normal";
    else nakitAkisiSinifi = "dusuk";

    // 5. Kentsel Dönüşüm Arsa Payı Analizi
    let donusumAnalizi: KonutDeğerlemeSonucu["kentselDonusumAnalizi"] | undefined;
    if (girdi.parselAlaniM2 && girdi.binadakiToplamDaire && girdi.binadakiToplamDaire > 0) {
      const daireArsaPayiM2 = Number((girdi.parselAlaniM2 / girdi.binadakiToplamDaire).toFixed(1));
      const arsaBirimM2Fiyati = bolgeKonutM2Baseline * 1.6; // Arsa m2 genelde dairenin 1.5-2 katıdır
      const arsaPayiDegeri = Math.round(daireArsaPayiM2 * arsaBirimM2Fiyati);
      const donusumPrim = Number((((arsaPayiDegeri - beklenenTL) / beklenenTL) * 100).toFixed(1));

      donusumAnalizi = {
        daireBasiArsaPayiM2: daireArsaPayiM2,
        tahminiArsaPayiDegeriTL: arsaPayiDegeri,
        donusumPrimPotansiyeliYuzde: donusumPrim,
        donusumFirsatiVarMi: donusumPrim > 15 && girdi.binaYasi >= 25,
      };
    }

    let yatirimOzeti = "";
    if (nakitAkisiSinifi === "mukemmel") {
      yatirimOzeti = `YÜKSEK KİRA GETİRİSİ: Konut ${amortismanYili} yılda kendi kendini amorti ediyor (Yıllık %${kiraVerimi} brüt getiri). Nakit akışı için çok cazip!`;
    } else if (donusumAnalizi?.donusumFirsatiVarMi) {
      yatirimOzeti = `KENTSEL DÖNÜŞÜM ARBİTRAJI: Binanın ${girdi.binaYasi} yaşında olması sebebiyle arsa payı değeri (${donusumAnalizi.tahminiArsaPayiDegeriTL.toLocaleString("tr-TR")} ₺) daire değerinden %${donusumAnalizi.donusumPrimPotansiyeliYuzde} daha yüksek!`;
    } else {
      yatirimOzeti = `Standart Konut Yatırımı: ${amortismanYili} yıl amortisman süresi ve %${kiraVerimi} yıllık kira verimi ile dengeli piyasa koşullarında.`;
    }

    return {
      tahminiPiyasaDegeriTL: beklenenTL,
      tahminiM2FiyatiTL: birimM2Fiyati,
      degerlemeAraligi: { altTL, ustTL },
      amortismanAnalizi: {
        tahminiAylikKiraTL: aylikKira,
        yillikBrutKiraTL: yillikBrutKira,
        amortismanYili,
        kiraVerimiYuzde: kiraVerimi,
        nakitAkisiSinifi,
      },
      kentselDonusumAnalizi: donusumAnalizi,
      carpanlar,
      yatirimOzeti,
    };
  }
}