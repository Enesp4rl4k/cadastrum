import type { FiyatTahmini } from "./types";
import { MIN_MAHALLE_BASELINE_SAMPLES } from "./constants";
import { clamp } from "./emsal-havuzu";

export interface BolgeBaselineSonuc {
  baseline: number;
  kaynak: FiyatTahmini["baselineKaynak"];
  not: string;
  guvenAdet: number;
  ozet?: import("../fiyat-correction").BolgeFiyatOzeti;
  veriKalitesiNotlari: string[];
  emsalOzeti: FiyatTahmini["emsalOzeti"];
  tazelikOzeti: FiyatTahmini["tazelikOzeti"];
  kategori: "arsa" | "tarla";
  emsalListesi: FiyatTahmini["emsalListesi"];
  triUyumsuzluk?: number;
  triManuelReview?: boolean;
  /**
   * Emsal (ilan/asking) fiyatından kapanış fiyatına inmek için uygulanan
   * iskonto oranı — sadece gerçek emsal havuzu kullanıldığında > 0.
   * Statik baseline yollarında 0 (o tablolar zaten kapanış seviyesinde kabul edilir).
   *
   * Dışarı veriliyor çünkü motorun HEDEFİ kapanış fiyatı, ama elimizdeki
   * doğrulama verisi (ilan veri setleri) asking fiyatı — bu alan olmadan
   * backtest, iskontoyu "hata" sanıp emsal yolunu haksız yere cezalandırıyordu.
   */
  uygulananIndirim?: number;
}

export function guvenSkoruTavani(kaynak: FiyatTahmini["baselineKaynak"]): number {
  switch (kaynak) {
    case "spatial-radius":     return 98;
    case "ilanGozlem-mahalle": return 98;
    case "ilanGozlem-ilce":    return 88;
    case "mahalle-baseline":   return 90;
    case "ilce-semt-baseline": return 80;
    case "ilce-baseline":      return 70;
    case "il-baseline":        return 55;
    case "fallback":           return 40;
    default:                   return 95;
  }
}

export function guvenHesapla(params: {
  baseline: BolgeBaselineSonuc;
  cevreVar: boolean;
  egimVar: boolean;
  multiplierClamped: boolean;
  resmiImarVar: boolean;
}): {
  guven: FiyatTahmini["guven"];
  guvenSkoru: number;
  guvenAciklama: string;
  altRange: number;
  ustRange: number;
  veriKalitesiNotlari: string[];
} {
  const { baseline, cevreVar, egimVar, multiplierClamped, resmiImarVar } = params;
  const veriKalitesiNotlari = [...baseline.veriKalitesiNotlari];
  let skor = 15;

  if (baseline.kaynak === "spatial-radius") skor = 62;
  else if (baseline.kaynak === "ilanGozlem-mahalle") skor = 58;
  else if (baseline.kaynak === "ilanGozlem-ilce") skor = 44;
  else if (baseline.kaynak === "mahalle-baseline") skor = 42;
  else if (baseline.kaynak === "ilce-semt-baseline") skor = 36;
  else if (baseline.kaynak === "ilce-baseline") skor = 30;
  else if (baseline.kaynak === "il-baseline") skor = 24;
  else skor = 12;

  if (baseline.guvenAdet > 0) skor += Math.min(20, baseline.guvenAdet * 2);
  if (baseline.ozet) {
    skor += baseline.ozet.guvenSeviyesi === "yuksek" ? 10 : baseline.ozet.guvenSeviyesi === "orta" ? 4 : 0;
    skor -= Math.min(18, Math.round(baseline.ozet.volatilite / 4));
  }
  if (baseline.emsalOzeti) {
    skor += Math.round(baseline.emsalOzeti.ortalamaBenzerlik * 12);
    skor += Math.min(6, baseline.emsalOzeti.dogrulanabilirAdet * 2);
    if (baseline.emsalOzeti.mahalleAdet >= MIN_MAHALLE_BASELINE_SAMPLES) skor += 6;
  }
  if (baseline.tazelikOzeti) {
    const t = baseline.tazelikOzeti;
    if (t.ortalamaYasGun <= 30) skor += 8;
    else if (t.ortalamaYasGun <= 60) skor += 4;
    else if (t.ortalamaYasGun <= 90) skor += 0;
    else skor -= 4;
    if (t.son30Gun >= 3) skor += 4;
  }
  if (cevreVar) {
    skor += 4;
  } else {
    veriKalitesiNotlari.push("�evre/POI verisi yok; eri�im etkisi n�tr kabul edildi.");
  }
  if (egimVar) {
    skor += 4;
  } else {
    veriKalitesiNotlari.push("E�im verisi yok; topo�rafya etkisi n�tr kabul edildi.");
  }
  if (resmiImarVar) {
    skor += 8;
    veriKalitesiNotlari.push("Resmi e-Plan imar verisi fiyat sinyaline dahil edildi.");
  } else {
    veriKalitesiNotlari.push("Resmi e-Plan verisi yok; imar sinyali ilan/parsel heuristi�inden �retildi.");
  }
  if (multiplierClamped) {
    skor -= 6;
    veriKalitesiNotlari.push("Heuristik �arpanlar ta�mas�n diye tahmin koruma band�na s�k��t�r�ld�.");
  }

  skor = clamp(Math.round(skor), 5, 95);

  let guven: FiyatTahmini["guven"] = "dusuk";
  let altRange = 0.6;
  let ustRange = 1.4;
  if (skor >= 75) {
    guven = "yuksek";
    altRange = 0.9;
    ustRange = 1.1;
  } else if (skor >= 55) {
    guven = "orta";
    altRange = 0.82;
    ustRange = 1.18;
  } else if (skor >= 35) {
    guven = "orta";
    altRange = 0.74;
    ustRange = 1.26;
  } else if (baseline.kaynak === "il-baseline") {
    altRange = 0.55;
    ustRange = 1.45;
  } else if (baseline.kaynak === "fallback") {
    altRange = 0.5;
    ustRange = 1.5;
  } else if (baseline.kaynak === "mahalle-baseline") {
    altRange = 0.62;
    ustRange = 1.38;
  } else if (baseline.kaynak === "ilce-semt-baseline") {
    altRange = 0.60;
    ustRange = 1.40;
  } else if (baseline.kaynak === "ilce-baseline") {
    altRange = 0.55;
    ustRange = 1.45;
  }

  const guvenAciklama =
    baseline.kaynak === "ilanGozlem-mahalle"
      ? `${baseline.guvenAdet} a��rl�kl� emsal ile �retildi. G�ven skoru ${skor}/100.`
      : baseline.kaynak === "ilanGozlem-ilce"
        ? `${baseline.guvenAdet} a��rl�kl� il�e emsali ile �retildi. Mahalle emsali gelirse daha da daral�r. G�ven skoru ${skor}/100.`
        : baseline.kaynak === "mahalle-baseline"
          ? `Mahalle bazl� baseline (AI/KNN, Bayesian shrinkage uygulanm��). Sahibinden'de gezinerek ger�ek emsallere ge�. G�ven skoru ${skor}/100.`
          : baseline.kaynak === "ilce-semt-baseline"
            ? `B�lge ortalamas� (semt d�zeyi). Sahibinden'de gezinerek ger�ek emsallere ge�. G�ven skoru ${skor}/100.`
            : baseline.kaynak === "ilce-baseline"
              ? `B�lge ortalamas� (il�e d�zeyi). Sahibinden'de gezinerek ger�ek emsallere ge�. G�ven skoru ${skor}/100.`
              : baseline.kaynak === "il-baseline"
                ? `B�lge ortalamas� (il d�zeyi). Sahibinden'de gezinerek ger�ek emsallere ge�. G�ven skoru ${skor}/100.`
                : `B�lgesel emsal bulunamad�; genel ortalama kullan�ld�. G�ven skoru ${skor}/100.`;

  return { guven, guvenSkoru: skor, guvenAciklama, altRange, ustRange, veriKalitesiNotlari };
}

export function ekGuvenKatmani(params: {
  baseline: BolgeBaselineSonuc;
  cevreVar: boolean;
  egimVar: boolean;
  multiplierClamped: boolean;
  resmiImarVar: boolean;
  manuelImarVar: boolean;
  manuelImarDetayAdet: number;
  manuelEmsalAdet: number;
}): {
  ekSkor: number;
  altRangeDelta: number;
  ustRangeDelta: number;
  guvenKirilimi: FiyatTahmini["guvenKirilimi"];
  sonrakiHamleler: string[];
  ekNotlar: string[];
} {
  const {
    baseline,
    resmiImarVar,
    manuelImarVar,
    manuelImarDetayAdet,
    manuelEmsalAdet,
  } = params;

  const guvenKirilimi: FiyatTahmini["guvenKirilimi"] = [];
  const sonrakiHamleler: string[] = [];
  const ekNotlar: string[] = [];
  let ekSkor = 0;
  let altRangeDelta = 0;
  let ustRangeDelta = 0;

  const baselinePuani =
    baseline.kaynak === "ilanGozlem-mahalle"
      ? 58
      : baseline.kaynak === "ilanGozlem-ilce"
        ? 44
        : baseline.kaynak === "mahalle-baseline"
          ? 42
          : baseline.kaynak === "ilce-semt-baseline"
            ? 36
            : baseline.kaynak === "ilce-baseline"
              ? 30
              : baseline.kaynak === "il-baseline"
                ? 24
                : 12;
  guvenKirilimi.push({
    etiket:
      baseline.kaynak === "ilanGozlem-mahalle"
        ? "Mahalle emsali"
        : baseline.kaynak === "ilanGozlem-ilce"
          ? "�l�e emsali"
          : baseline.kaynak === "mahalle-baseline"
            ? "Mahalle baseline"
            : baseline.kaynak === "ilce-semt-baseline"
              ? "Semt baseline"
              : baseline.kaynak === "ilce-baseline"
                ? "�l�e baseline"
                : baseline.kaynak === "il-baseline"
                  ? "�l baseline"
                  : "Genel fallback",
    puan: baselinePuani,
    durum: baselinePuani >= 40 ? "pozitif" : baselinePuani >= 30 ? "notr" : "uyari",
  });

  if (baseline.guvenAdet > 0) {
    guvenKirilimi.push({
      etiket: "Canl� emsal adedi",
      puan: Math.min(20, baseline.guvenAdet * 2),
      durum: "pozitif",
    });
  }
  if (baseline.emsalOzeti) {
    guvenKirilimi.push({
      etiket: "Emsal benzerli�i",
      puan: Math.round(baseline.emsalOzeti.ortalamaBenzerlik * 12),
      durum: "pozitif",
    });
  }
  if (baseline.tazelikOzeti) {
    const yas = baseline.tazelikOzeti.ortalamaYasGun;
    const puan = yas <= 30 ? 8 : yas <= 60 ? 4 : yas > 90 ? -4 : 0;
    if (puan !== 0) {
      guvenKirilimi.push({
        etiket: "Veri tazeli�i",
        puan,
        durum: puan > 0 ? "pozitif" : "uyari",
      });
    }
  }

  if (resmiImarVar) {
    ekSkor += 8;
    altRangeDelta += 0.02;
    ustRangeDelta -= 0.02;
    guvenKirilimi.push({ etiket: "Resmi e-Plan imar�", puan: 8, durum: "pozitif" });
    ekNotlar.push("Resmi e-Plan imar verisi fiyat sinyaline dahil edildi.");
  } else if (manuelImarVar) {
    const puan = manuelImarDetayAdet >= 3 ? 6 : manuelImarDetayAdet >= 1 ? 3 : 0;
    ekSkor += puan;
    if (manuelImarDetayAdet >= 2) {
      altRangeDelta += 0.015;
      ustRangeDelta -= 0.015;
    }
    guvenKirilimi.push({ etiket: "Manuel imar giri�i", puan, durum: puan > 0 ? "pozitif" : "notr" });
    ekNotlar.push("�mar sinyali kullan�c� giri�i ile g��lendirildi.");
  } else {
    guvenKirilimi.push({ etiket: "�mar belirsizli�i", puan: -4, durum: "uyari" });
    sonrakiHamleler.push("Kullan�m karar� ile TAKS/Emsal girersen fiyat sapmas� ciddi azal�r.");
  }

  if (manuelEmsalAdet > 0) {
    const puan = Math.min(8, manuelEmsalAdet * 3);
    ekSkor += puan;
    altRangeDelta += manuelEmsalAdet >= 2 ? 0.02 : 0.01;
    ustRangeDelta -= manuelEmsalAdet >= 2 ? 0.02 : 0.01;
    guvenKirilimi.push({ etiket: "Manuel emsal deste�i", puan, durum: "pozitif" });
    ekNotlar.push(`${manuelEmsalAdet} manuel emsal fiyat havuzuna dahil edildi.`);
  } else {
    guvenKirilimi.push({ etiket: "Manuel emsal yok", puan: 0, durum: "notr" });
    sonrakiHamleler.push("B�lgede bildi�in ger�ek sat��/ilan fiyat� varsa ekle (g�ven +%15).");
  }

  return {
    ekSkor,
    altRangeDelta,
    ustRangeDelta,
    guvenKirilimi,
    sonrakiHamleler,
    ekNotlar,
  };
}
