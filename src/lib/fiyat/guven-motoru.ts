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

/**
 * Baseline kaynağına göre güven skoru tavanı — ÖLÇÜMDEN türetilmiş.
 *
 * Bu tablo eskiden elle yazılmıştı ve ölçülen doğrulukla TERS orantılıydı:
 * `mahalle-baseline` 90 tavan alıyordu, `ilanGozlem-ilce` ise 88. Oysa
 * 2026-08-31 backtest koşumu (test/backtest/real-engine.spec.ts, n=2.400,
 * referans kalite süzgeci uygulanmış) şunu ölçtü:
 *
 *   kaynak                ARSA ±%20   ARSA bias   TARLA ±%20   TARLA bias
 *   ilanGozlem-mahalle      30,1        +7,3        40,8         +8,4
 *   ilanGozlem-ilce         19,2       +17,9        49,1         +5,1
 *   mahalle-baseline        19,4      +221,6        47,9        +14,0
 *
 * Yani statik mahalle tablosu ARSA'da felaket (bias +%222 — köy arsasını
 * şehir fiyatıyla etiketliyor), TARLA'da makul. Tek bir sayı iki kategoriyi
 * birden temsil edemez; tavan artık kategoriye de bakıyor.
 *
 * Tavanlar ölçülen ±%20 isabetiyle kabaca orantılı tutuldu. Kesin bir formül
 * DEĞİL — amaç, kullanıcıya gösterilen güvenin ölçülen doğruluğu geçmemesi.
 * Ölçüm değişince bu tablo da güncellenmeli (test/guven-motoru.spec.ts
 * sıralamayı kilitliyor).
 */
/**
 * KONUT DİYE BİR KATEGORİ YOK — ve bu bir bulgu.
 *
 * Bu fonksiyona konut tavanı eklendi, sonra KALDIRILDI. Sebebi ölçüm:
 * `bolge-baseline.ts` kategoriyi `isTarimsal ? "tarla" : "arsa"` ile
 * belirliyor — üçüncü dal YOK. `SEGMENT_INDEX` ve `MAHALLE_BASELINE` konut
 * kolonu taşıyor ama fiyat motoru o kolonu ASLA seçmiyor.
 *
 * Yani "motor konut tahmini üretiyor" varsayımı yanlıştı; konut tavanı ölü
 * kod olurdu ve bu projede ölü kod eklemek tam da ayıkladığımız şey.
 *
 * GERÇEK DURUM DAHA CİDDİ: bir MESKEN/BİNA parseli "arsa" sayılıyor ve
 * `nitelikCarpani` ona 2,5× uyguluyor. Yani üzerinde yapı olan bir parsel,
 * arsa baseline'ı × 2,5 ile fiyatlanıyor ve bu zincir HİÇ ÖLÇÜLMEDİ —
 * backtest yalnızca arsa/tarla ilanları içeriyor, mesken ilanı yok.
 * Ayrıntı: data/o2-konut-kategorisi-olcum.json
 */
export function guvenSkoruTavani(
  kaynak: FiyatTahmini["baselineKaynak"],
  kategori: "arsa" | "tarla" = "arsa",
): number {
  switch (kaynak) {
    case "spatial-radius":     return 98;
    case "ilanGozlem-mahalle": return 98;
    case "ilanGozlem-ilce":    return 88;
    // ARSA'da ölçülen bias +%222. Bu rakamın 90 güvenle sunulması, projede
    // ayıkladığımız "uydurma sayıyı veri gibi göstermek" deseninin ta kendisi.
    case "mahalle-baseline":   return kategori === "tarla" ? 78 : 45;
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

  /**
   * P12 — ölçülmemiş katman, ölçülmüş katmanın ÜSTÜNE çıkamaz.
   *
   * `spatial-radius` burada 62 ile `ilanGozlem-mahalle`'nin (58) üstündeydi.
   * O sıralamanın ölçümü yok. Ölçülen tek şey tersini söylüyordu: mahalle
   * merkezi koordinatlarıyla çalışırken spatial, mahalle katmanını eziyor ve
   * ±%20 isabetini arsa 26,7 → 20,3 / tarla 43,9 → 25,1'e düşürüyordu
   * (`data/o1-spatial-katman-olcum.json`). Düzeltme olarak `spatial-emsal.ts`
   * artık `koordKaynagi === "mahalle-merkez"` kayıtlarını eliyor.
   *
   * Filtreden SONRAKİ hâli — yani gerçek parsel koordinatıyla çalışan
   * spatial — hâlâ ÖLÇÜLMEDİ: korpusta parsel koordinatlı ilan yok, üretimde
   * oranı %4,4. Ölçülmemiş bir katmanı ölçülmüşün üstüne koymak, bu projede
   * tekrar tekrar ayıkladığımız desenin ta kendisi.
   *
   * Bu yüzden EŞİT: gerçek koordinat mahalle havuzunun bir alt kümesi olduğu
   * için "mahalle kadar iyi" savunulabilir; "daha iyi" savunulamaz. Ölçüm
   * geldiğinde bu sayı ölçüme göre ayrılır.
   */
  if (baseline.kaynak === "spatial-radius") skor = 58;
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
    veriKalitesiNotlari.push("Çevre/POI verisi yok; erişim etkisi nötr kabul edildi.");
  }
  if (egimVar) {
    skor += 4;
  } else {
    veriKalitesiNotlari.push("Eğim verisi yok; topoğrafya etkisi nötr kabul edildi.");
  }
  if (resmiImarVar) {
    skor += 8;
    veriKalitesiNotlari.push("Resmi e-Plan imar verisi fiyat sinyaline dahil edildi.");
  } else {
    veriKalitesiNotlari.push("Resmi e-Plan verisi yok; imar sinyali ilan/parsel heuristiğinden üretildi.");
  }
  if (multiplierClamped) {
    skor -= 6;
    veriKalitesiNotlari.push("Heuristik çarpanlar taşmasın diye tahmin koruma bandına sıkıştırıldı.");
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
    baseline.kaynak === "spatial-radius"
      ? `${baseline.guvenAdet} ağırlıklı spatial (yarıçap) emsali ile üretildi. Güven skoru ${skor}/100.`
      : baseline.kaynak === "ilanGozlem-mahalle"
        ? `${baseline.guvenAdet} ağırlıklı emsal ile üretildi. Güven skoru ${skor}/100.`
        : baseline.kaynak === "ilanGozlem-ilce"
        ? `${baseline.guvenAdet} ağırlıklı ilçe emsali ile üretildi. Mahalle emsali gelirse daha da daralır. Güven skoru ${skor}/100.`
        : baseline.kaynak === "mahalle-baseline"
          ? `Mahalle bazlı baseline (AI/KNN, Bayesian shrinkage uygulanmış). Sahibinden'de gezinerek gerçek emsallere geç. Güven skoru ${skor}/100.`
          : baseline.kaynak === "ilce-semt-baseline"
            ? `Bölge ortalaması (semt düzeyi). Sahibinden'de gezinerek gerçek emsallere geç. Güven skoru ${skor}/100.`
            : baseline.kaynak === "ilce-baseline"
              ? `Bölge ortalaması (ilçe düzeyi). Sahibinden'de gezinerek gerçek emsallere geç. Güven skoru ${skor}/100.`
              : baseline.kaynak === "il-baseline"
                ? `Bölge ortalaması (il düzeyi). Sahibinden'de gezinerek gerçek emsallere geç. Güven skoru ${skor}/100.`
                : `Bölgesel emsal bulunamadı; genel ortalama kullanıldı. Güven skoru ${skor}/100.`;

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
    baseline.kaynak === "spatial-radius"
      ? 58
      : baseline.kaynak === "ilanGozlem-mahalle"
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
      baseline.kaynak === "spatial-radius"
        ? "Spatial radius emsali"
        : baseline.kaynak === "ilanGozlem-mahalle"
          ? "Mahalle emsali"
        : baseline.kaynak === "ilanGozlem-ilce"
          ? "İlçe emsali"
          : baseline.kaynak === "mahalle-baseline"
            ? "Mahalle baseline"
            : baseline.kaynak === "ilce-semt-baseline"
              ? "Semt baseline"
              : baseline.kaynak === "ilce-baseline"
                ? "İlçe baseline"
                : baseline.kaynak === "il-baseline"
                  ? "İl baseline"
                  : "Genel fallback",
    puan: baselinePuani,
    durum: baselinePuani >= 40 ? "pozitif" : baselinePuani >= 30 ? "notr" : "uyari",
  });

  if (baseline.guvenAdet > 0) {
    guvenKirilimi.push({
      etiket: "Canlı emsal adedi",
      puan: Math.min(20, baseline.guvenAdet * 2),
      durum: "pozitif",
    });
  }
  if (baseline.emsalOzeti) {
    guvenKirilimi.push({
      etiket: "Emsal benzerliği",
      puan: Math.round(baseline.emsalOzeti.ortalamaBenzerlik * 12),
      durum: "pozitif",
    });
  }
  if (baseline.tazelikOzeti) {
    const yas = baseline.tazelikOzeti.ortalamaYasGun;
    const puan = yas <= 30 ? 8 : yas <= 60 ? 4 : yas > 90 ? -4 : 0;
    if (puan !== 0) {
      guvenKirilimi.push({
        etiket: "Veri tazeliği",
        puan,
        durum: puan > 0 ? "pozitif" : "uyari",
      });
    }
  }

  if (resmiImarVar) {
    ekSkor += 8;
    altRangeDelta += 0.02;
    ustRangeDelta -= 0.02;
    guvenKirilimi.push({ etiket: "Resmi e-Plan imarı", puan: 8, durum: "pozitif" });
    ekNotlar.push("Resmi e-Plan imar verisi fiyat sinyaline dahil edildi.");
  } else if (manuelImarVar) {
    const puan = manuelImarDetayAdet >= 3 ? 6 : manuelImarDetayAdet >= 1 ? 3 : 0;
    ekSkor += puan;
    if (manuelImarDetayAdet >= 2) {
      altRangeDelta += 0.015;
      ustRangeDelta -= 0.015;
    }
    guvenKirilimi.push({ etiket: "Manuel imar girişi", puan, durum: puan > 0 ? "pozitif" : "notr" });
    ekNotlar.push("İmar sinyali kullanıcı girişi ile güçlendirildi.");
  } else {
    guvenKirilimi.push({ etiket: "İmar belirsizliği", puan: -4, durum: "uyari" });
    sonrakiHamleler.push("Kullanım kararı ile TAKS/Emsal girersen fiyat sapması ciddi azalır.");
  }

  if (manuelEmsalAdet > 0) {
    const puan = Math.min(8, manuelEmsalAdet * 3);
    ekSkor += puan;
    altRangeDelta += manuelEmsalAdet >= 2 ? 0.02 : 0.01;
    ustRangeDelta -= manuelEmsalAdet >= 2 ? 0.02 : 0.01;
    guvenKirilimi.push({ etiket: "Manuel emsal desteği", puan, durum: "pozitif" });
    ekNotlar.push(`${manuelEmsalAdet} manuel emsal fiyat havuzuna dahil edildi.`);
  } else {
    guvenKirilimi.push({ etiket: "Manuel emsal yok", puan: 0, durum: "notr" });
    sonrakiHamleler.push("Bölgede bildiğin gerçek satış/ilan fiyatı varsa ekle (güven +%15).");
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
